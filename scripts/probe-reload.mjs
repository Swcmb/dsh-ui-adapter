// scripts/probe-reload.mjs — reload the DSH renderer once and capture the
// client-half factory errors from console/exceptions. Read-only diagnosis.
const PORT = process.env.CDP_PORT || '9333';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push('EXC: ' + (d.exception?.description || d.text));
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG: ' + m.params.entry.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('CONSOLE: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
});
await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: false });
await new Promise((r) => setTimeout(r, 9000));
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({patchStyle: !!document.getElementById('dsh-ui-adapter-patch'), bridge: !!window.__DSH_CTX_BILI_BRIDGE__})`,
  returnByValue: true,
});
console.log('AFTER_RELOAD:', r.result?.result?.value);
console.log('RELEVANT_ERRORS:', JSON.stringify(errors.filter((e) => /ui-adapter|dsh-ui|slots|require|factory|client-modules/i.test(e)).slice(0, 12), null, 2));
console.log('TOTAL_ERRORS:', errors.length);
ws.close();
