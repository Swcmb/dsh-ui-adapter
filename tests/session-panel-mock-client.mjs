// 用 mock 的 window/React/slots 跑一遍 client.js factory，验证无运行时构造错误。
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

let loaded = null;
const h = (...args) => ({ type: args[0], props: args[1], children: args.slice(2) });
const noop = () => {};
const React = {
  createElement: h,
  useState: init => [typeof init === 'function' ? init() : init, noop],
  useRef: v => ({ current: v }),
  useEffect: noop,
};
const ReactDOM = { createRoot: () => ({ render: noop, unmount: noop }) };

const sandbox = {
  window: {
    __ModuleLoader__: { load: def => { loaded = def; } },
    __dshSessionPanelToggle: undefined,
    setInterval: () => 1, clearInterval: noop,
    addEventListener: noop, removeEventListener: noop,
    innerWidth: 1400, innerHeight: 900,
  },
  document: {
    head: { appendChild: noop },
    body: { appendChild: noop },
    getElementById: () => null,
    querySelector: () => ({ getAttribute: () => 'session-1' }),
    createElement: () => ({ setAttribute: noop, appendChild: noop, addEventListener: noop, style: {} }),
    hidden: false,
    addEventListener: noop, removeEventListener: noop,
  },
  console,
  URL,
  fetch: async () => ({ ok: true, json: async () => ({ ok: true, value: {} }) }),
  setInterval: () => 1, clearInterval: noop,
  setTimeout: () => 1, clearTimeout: noop,
  Date, Math, JSON, Number, String, Array, Object, Promise, Error,
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'client.js' });

if (!loaded) throw new Error('module was not registered');
if (typeof loaded.factory !== 'function') throw new Error('no factory');
const require = name => {
  if (name === 'react') return React;
  if (name === 'react-dom/client') return ReactDOM;
  throw new Error('unexpected require: ' + name);
};
const mod = loaded.factory(require);
if (typeof mod.apply !== 'function' || !Array.isArray(mod.inject)) throw new Error('bad module exports');

// 模拟 DSH apply(ctx)，捕获 slot 注册名
const registered = [];
const ctx = {
  slots: {
    inject: (name, fn) => { registered.push('inject:' + name); return fn(); },
    register: (opts, component) => { registered.push('register:' + opts.name + '/' + opts.key); return () => {}; },
  },
};
let applied = false;
try {
  mod.apply(ctx);
  applied = true;
} catch (e) {
  throw new Error('apply threw: ' + e.message);
}
if (!registered.some(r => r === 'register:sidebar.right.pane.tab/dsh-session-panel')) throw new Error('tab slot not registered');
if (!registered.some(r => r === 'register:sidebar.right.pane.tab.title/dsh-session-panel')) throw new Error('tab title slot not registered');

console.log(JSON.stringify({
  moduleId: loaded.id,
  inject: mod.inject,
  applyOk: applied,
  slots: registered,
}, null, 2));
