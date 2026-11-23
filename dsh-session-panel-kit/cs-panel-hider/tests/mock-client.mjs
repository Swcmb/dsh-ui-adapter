// 用 mock DOM 跑 client.js factory + apply，验证原生契约与隐藏目标。
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
let loaded = null;
const appended = [];
const removedAttrs = new Set();

const fakeStyle = { id: '', textContent: '', setAttribute() {}, remove() {} };
const body = {
  hasAttribute: n => n === 'data-dsh-claude-session-panel',
  removeAttribute: n => removedAttrs.add(n),
  appendChild() {},
};
const sandbox = {
  window: { __ModuleLoader__: { load: def => { loaded = def; } } },
  document: {
    head: { appendChild: el => appended.push(el) },
    documentElement: {},
    body,
    getElementById: () => null,
    createElement: () => ({ ...fakeStyle }),
  },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: fn => fn(),
  setTimeout: fn => fn(),
  console, Date, Math, JSON, String, Array, Object, Promise, Error,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'client.js' });

assert.ok(loaded, 'module not registered');
assert.equal(loaded.id, '@local/dsh-cs-panel-hider');
const mod = loaded.factory(name => { throw new Error('unexpected require: ' + name); });
assert.equal(mod.inject.length, 0, 'inject should be empty');
assert.equal(typeof mod.apply, 'function');

const disposer = mod.apply();
assert.equal(typeof disposer, 'function');
assert.ok(appended.length >= 1, 'no style injected');
const css = appended[0].textContent;
assert.ok(css.includes('.dsh-claude-details-root'), 'panel selector missing');
assert.ok(css.includes('.dsh-claude-session-panel-button'), 'toggle selector missing');
assert.ok(css.includes('display:none!important'), 'no forced hide');
assert.ok(removedAttrs.has('data-dsh-claude-session-panel'), 'body flag not cleaned');
disposer();

console.log(JSON.stringify({ moduleId: loaded.id, inject: mod.inject, cssBytes: css.length, flagCleaned: true, ok: true }, null, 2));
