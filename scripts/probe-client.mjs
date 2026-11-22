// scripts/probe-client.mjs — read-only CDP probe for the ui-adapter client half.
// Connects to the running DSH renderer over the debug port and inspects DOM /
// globals without clicking or screenshotting. Exits non-zero on CDP failure.
const PORT = process.env.CDP_PORT || '9333';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('probe: no page target on ' + PORT);
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
await new Promise((res) => ws.addEventListener('open', res));
await send('Runtime.enable');

const expr = `(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const scripts = [...document.querySelectorAll('script')].map(s => s.src || ('inline:' + (s.textContent || '').length));
  const loader = window.__ModuleLoader__;
  return JSON.stringify({
    patchStyle: !!document.getElementById('dsh-ui-adapter-patch'),
    globalCfg: !!window.__DSH_CTX_BILI_BRIDGE__,
    moduleLoader: typeof loader,
    loaderKeys: loader && typeof loader === 'object' ? Object.keys(loader) : null,
    queueIds: loader && Array.isArray(loader.pendingQueue) ? loader.pendingQueue.map((r) => r && r.id) : null,
    globals: Object.keys(window).filter((k) => /dsh|module|boot|plugin|client|manifest|graph/i.test(k)),
    marketLoads: (() => {
      try {
        const m = window.__dshmarketClientLoads;
        if (!m) return null;
        const arr = Array.isArray(m) ? m : Object.entries(m).map(([k, v]) => ({ k, v }));
        return JSON.parse(JSON.stringify(arr)).slice(-25);
      } catch { return 'err'; }
    })(),
    bootKeys: window.__DSH_BOOT__ ? Object.keys(window.__DSH_BOOT__) : null,
    bootStr: (() => {
      try {
        const b = window.__DSH_BOOT__;
        if (!b) return null;
        const ids = [];
        const walk = (o, d) => {
          if (d > 4 || !o || typeof o !== 'object') return;
          if (typeof o.id === 'string') ids.push(o.id);
          for (const v of Object.values(o)) walk(v, d + 1);
        };
        walk(b, 0);
        return { ids: [...new Set(ids)].slice(0, 80), hasAdapter: JSON.stringify(b).includes('dsh-ui-adapter') };
      } catch (e) { return { err: String(e) }; }
    })(),
    adapterEntry: (() => {
      try {
        const b = window.__DSH_BOOT__ || {};
        const es = b.entries || [];
        const e = es.find((x) => x && String(x.id).includes('ui-adapter'));
        const batches = (b.batches || []).map((bt, i) => ({ i, ids: (bt.entries || bt.ids || []).filter?.((x) => String(x).includes('ui-adapter')) }));
        return { entry: e || null, batches };
      } catch (err) { return { err: String(err) }; }
    })(),
    scriptCount: scripts.length,
    scripts: scripts.slice(0, 60),
    inlines: [...document.querySelectorAll('script:not([src])')].map((s) => s.textContent.slice(0, 900)),
    adRecom: q('a.lc-recom'),
    btwEntry: q('.dsh-btw-entry,.dsh-btw-global-entry'),
    btwAll: q('[class*="dsh-btw"]'),
    claudeStyle: document.body ? document.body.getAttribute('data-dsh-claude-style') : null,
    patchCss: (document.getElementById('dsh-ui-adapter-patch') || {}).textContent || null,
    btwDisplay: [...document.querySelectorAll('.dsh-btw-entry,.dsh-btw-global-entry')].map((e) => getComputedStyle(e).display).slice(0, 6),
    fadeVar: getComputedStyle(document.body).getPropertyValue('--dsh-transcript-fade-h').trim(),
    transcriptFade: q('[data-dsh-claude-transcript] [data-composer-seat]'),
    title: document.title,
    topButtons: [...document.querySelectorAll('button')].map((b) => ({ b, r: b.getBoundingClientRect() })).filter((x) => x.r.top < 64 && x.r.width > 0 && x.r.height > 0).map((x) => ({ cls: String(x.b.className).slice(0, 44), text: (x.b.textContent || '').trim().slice(0, 12), title: (x.b.title || '').slice(0, 16), aria: (x.b.getAttribute('aria-label') || '').slice(0, 16), l: Math.round(x.r.left), w: Math.round(x.r.width) })).slice(0, 30),
    btwEls: [...document.querySelectorAll('[class*="btw"]')].map((e) => { const r = e.getBoundingClientRect(); return { cls: String(e.className).slice(0, 46), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), display: getComputedStyle(e).display }; }).slice(0, 10),
    sidebarState: (() => {
      try {
        const cur = JSON.parse(localStorage.getItem('dsh.sessions.current') || '{}').sessionId;
        if (!cur) return null;
        const raw = localStorage.getItem('dsh.sidebar-right.v1.' + cur);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return { err: String(e) }; }
    })(),
    lsKeys: (() => {
      try {
        return Object.keys(localStorage).filter((k) => /better|sidebar|guide|prefs|dsh/i.test(k)).map((k) => ({ k, v: (localStorage.getItem(k) || '').slice(0, 260) })).slice(0, 20);
      } catch { return 'err'; }
    })(),
    rightPaneText: (() => {
      const el = document.querySelector('[class*="rightbar"],[class*="right-bar"],[class*="sidebar-right"],[class*="sidecard"],[class*="side-card"]');
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140) : null;
    })(),
    composerStruct: (() => {
      const m = document.querySelector('[aria-label^="选择模型"]');
      const c = document.querySelector('[aria-label^="上下文已用"]');
      const info = (e) => e ? { cls: String(e.className).slice(0, 40), tag: e.tagName, right: Math.round(e.getBoundingClientRect().right), left: Math.round(e.getBoundingClientRect().left), mr: getComputedStyle(e).marginRight, ml: getComputedStyle(e).marginLeft } : null;
      return { model: info(m), ring: info(c), sameParent: !!m && !!c && m.parentElement === c.parentElement, mNext: m && m.nextElementSibling ? String(m.nextElementSibling.className).slice(0, 40) : null, cPrev: c && c.previousElementSibling ? String(c.previousElementSibling.className).slice(0, 40) : null };
    })(),
  });
})()`;

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(r.result?.result?.value ?? JSON.stringify(r));

// Is the served bundle the NEW build (has ensurePatchStyle / UI_PATCH_CSS)?
const htmlExpr = `(() => {
  const e = (window.__DSH_BOOT__.entries || []).find(x => x && String(x.id).includes('ui-adapter'));
  if (!e) return Promise.resolve(JSON.stringify({ error: 'no entry' }));
  return fetch('dsh-app://app/' + e.url).then(r => r.text()).then(t => JSON.stringify({
    rev: e.rev, len: t.length,
    hasEnsure: t.includes('ensurePatchStyle'),
    hasPatchCss: t.includes('UI_PATCH_CSS'),
    hasPatchId: t.includes('dsh-ui-adapter-patch'),
  }));
})()`;
const r2 = await send('Runtime.evaluate', { expression: htmlExpr, awaitPromise: true, returnByValue: true });
console.log('HTML', r2.result?.result?.value ?? JSON.stringify(r2.result?.exceptionDetails || r2));
ws.close();
