// dsh-default-sidebar-tab — 页面（renderer）只读探测器
// 连 Electron 的 remote debugging 端口（DSH 需以 --remote-debugging-port=<port> 启动），
// 在真实 app 页面 dsh-app://app/ 里执行表达式，用于非截图验证。
// 用法：
//   node scripts/page-probe.mjs state
//   node scripts/page-probe.mjs eval "<表达式>"
// SPDX-License-Identifier: GPL-3.0-or-later

const PORT = process.env.DSH_DEBUG_PORT || '9333';

async function pageTarget() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
  const list = await res.json();
  return list.find((t) => t.url.startsWith('dsh-app://')) ?? list.find((t) => t.type === 'page');
}

async function evaluate(expression) {
  const target = await pageTarget();
  if (!target) throw new Error('没有找到 dsh-app 页面目标');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

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
    const result = await new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
    if (result.exceptionDetails) {
      return { error: result.exceptionDetails.text ?? 'exception', detail: String(result.exceptionDetails.exception?.description ?? '') };
    }
    return result.result?.value;
  } finally {
    try { ws.close(); } catch { /* 忽略 */ }
  }
}

const STATE = `(() => {
  const readDiag = () => {
    try {
      const raw = window.localStorage.getItem('dsh-default-sidebar-tab:diag');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return { error: String(e) }; }
  };
  const layouts = () => {
    const out = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith('dsh.sidebar-right.v1.')) continue;
      let v = null;
      try { v = JSON.parse(window.localStorage.getItem(k)); } catch {}
      const bySession = v?.bySession ?? {};
      const entry = Object.entries(bySession)[0]?.[1] ?? {};
      const tabMap = entry?.tabs ?? {};
      const pane = entry?.layout?.nodes?.pane1 ?? {};
      out.push({
        key: k,
        activeTabId: pane.activeTabId,
        tabs: (pane.tabs ?? []).map((id) => ({ id, kind: tabMap[id]?.kind })),
      });
    }
    return out;
  };
  // 找右栏开关：按 aria-label / title / data-* 里含侧栏/右栏语义的按钮。
  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
    .map((el) => ({
      label: el.getAttribute('aria-label') || el.getAttribute('title') || '',
      testid: el.getAttribute('data-testid') || el.getAttribute('data-slot') || '',
      text: (el.textContent || '').trim().slice(0, 24),
    }))
    .filter((b) => /side|right|panel|rail|右|侧/.test((b.label + ' ' + b.testid).toLowerCase()))
    .slice(0, 20);

  return {
    url: location.href,
    title: document.title,
    injected: typeof window.__DSH_DEFAULT_SIDEBAR_TAB__ !== 'undefined' ? window.__DSH_DEFAULT_SIDEBAR_TAB__ : '<absent>',
    hasLoader: typeof window.__ModuleLoader__ === 'object',
    diag: readDiag(),
    layouts: layouts(),
    sidebarButtons: buttons,
  };
})()`;

const mode = process.argv[2] || 'state';
const expression = mode === 'eval' ? (process.argv[3] || '1') : STATE;
const value = await evaluate(expression);
console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
