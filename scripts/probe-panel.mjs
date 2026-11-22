const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const key = ++id;
    pending.set(key, resolve);
    ws.send(JSON.stringify({ id: key, method, params }));
  });
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise((resolve) => ws.addEventListener('open', resolve));

const expr = `(() => {
  const aside = document.querySelector('aside.dsh-claude-details');
  const btn = document.querySelector('.dsh-claude-session-panel-button');
  let flag = null;
  try { flag = localStorage.getItem('dsh-claude-style.sessionPanelClosed'); } catch (e) { flag = 'err:' + e.message; }
  return JSON.stringify({
    patchStyle: !!document.getElementById('dsh-ui-adapter-patch'),
    panelOpen: document.body.hasAttribute('data-dsh-claude-session-panel'),
    pressed: btn ? btn.getAttribute('aria-pressed') : null,
    asideWidth: aside ? Math.round(aside.getBoundingClientRect().width) : null,
    asideDisplay: aside ? getComputedStyle(aside).display : null,
    storedFlag: flag,
  });
})()`;

const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(result.result?.result?.value ?? JSON.stringify(result));
ws.close();
