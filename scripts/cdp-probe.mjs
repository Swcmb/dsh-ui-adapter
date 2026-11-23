// dsh-default-sidebar-tab — CDP 只读探测器
// 通过 DSH host 进程的 inspector (默认 127.0.0.1:9230) 在 dsh://host 上下文执行表达式，
// 用于非截图验证：插件是否在 cordis 树里、index 注入了哪些全局、web 模块清单是否含本插件。
// 只读：不修改任何状态。
// SPDX-License-Identifier: GPL-3.0-or-later

const PORT = process.env.DSH_CDP_PORT || '9230';

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
  return res.json();
}

async function evaluate(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', (e) => reject(new Error(e.message || 'ws error')), { once: true });
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  });

  try {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      includeCommandLineAPI: true,
    });
    if (result.exceptionDetails) {
      return { error: result.exceptionDetails.text ?? 'exception', detail: result.exceptionDetails };
    }
    return { value: result.result?.value };
  } finally {
    try { ws.close(); } catch { /* 忽略 */ }
  }
}

const PROBE = `(() => {
  const out = { globals: {}, notes: [] };
  out.globals.injectedConfig = typeof window.__DSH_DEFAULT_SIDEBAR_TAB__ !== 'undefined'
    ? window.__DSH_DEFAULT_SIDEBAR_TAB__ : '<absent>';
  out.globals.hasModuleLoader = typeof window.__ModuleLoader__ === 'object' && window.__ModuleLoader__ !== null;
  const loader = window.__ModuleLoader__;
  if (loader) {
    out.globals.loaderKeys = Object.keys(loader);
    for (const key of Object.keys(loader)) {
      const v = loader[key];
      if (v && typeof v === 'object') out.globals['loader_' + key] = (() => {
        try { return Object.keys(v).slice(0, 40); } catch { return '<unreadable>'; }
      })();
    }
    if (loader.modules && typeof loader.modules === 'object') {
      out.globals.registeredModules = Object.keys(loader.modules).filter((k) => /sidebar|default/i.test(k)).slice(0, 40);
    }
  }
  return out;
})()`;

const CONTEXT_PROBE = `(() => {
  const out = { found: [], note: '' };
  // host 上下文里 cordis 通常挂在 globalThis 上；逐个候选尝试，全部只读。
  const candidates = ['ctx', 'root', 'cordis', 'app', '__cordis__'];
  for (const name of candidates) {
    if (typeof globalThis[name] !== 'undefined') {
      out.found.push({ name, type: typeof globalThis[name] });
    }
  }
  const keys = Object.getOwnPropertyNames(globalThis).filter((k) => /cordis|ctx|dsh|web|plugin/i.test(k)).slice(0, 60);
  out.note = keys.join(',');
  return out;
})()`;

const targets = await listTargets();
console.log('targets:');
for (const t of targets) console.log(`  ${t.type}  ${t.url}  ${t.title}`);
const host = targets.find((t) => t.url === 'dsh://host') ?? targets[0];
if (!host) {
  console.log('no target');
  process.exit(1);
}

console.log('\n=== page probe (dsh://host) ===');
console.log(JSON.stringify((await evaluate(host.webSocketDebuggerUrl, PROBE)).value ?? null, null, 2));

console.log('\n=== globalThis keys probe ===');
console.log(JSON.stringify((await evaluate(host.webSocketDebuggerUrl, CONTEXT_PROBE)).value ?? null, null, 2));
