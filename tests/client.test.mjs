// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The adapter IIFE moved to client-adapter.js when lib/client.js became the
// unified (import-based) suite entry; these assertions still target the adapter.
const source = fs.readFileSync(path.join(here, '..', 'lib', 'client-adapter.js'), 'utf8');

const LEDGER = {
  sessions: [{
    id: 'session-8eafa12c-e877', conversationId: 'conv-42',
    inputTokens: 9879258, cachedTokens: 1728, outputTokens: 130106,
  }],
};

// ---------------------------------------------------------------------------
// Minimal DOM. Only the surfaces lib/client.js is allowed to touch are
// implemented, which doubles as a check that the bundle stays inside them.
// ---------------------------------------------------------------------------
function matches(el, selector) {
  if (selector === 'a.lc-recom') {
    return el.tagName === 'A' && String(el.className).split(/\s+/).includes('lc-recom');
  }
  const attr = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector);
  if (attr) return el.attributes[attr[1]] === attr[2];
  return false;
}

function createFakeDom({ withAd = true } = {}) {
  const descendants = (node) => node.children.flatMap((c) => [c, ...descendants(c)]);

  const make = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      className: '',
      textContent: '',
      id: '',
      type: '',
      style: {},
      parentElement: null,
      listeners: [],
      remove() {
        const p = el.parentElement;
        if (!p) return;
        p.children = p.children.filter((k) => k !== el);
        el.parentElement = null;
      },
      appendChild(child) { child.parentElement = el; el.children.push(child); return child; },
      insertBefore(child, ref) {
        child.parentElement = el;
        const at = ref ? el.children.indexOf(ref) : -1;
        if (at < 0) el.children.push(child); else el.children.splice(at, 0, child);
        return child;
      },
      replaceChildren(...kids) {
        el.children.forEach((k) => { k.parentElement = null; });
        el.children = [];
        kids.forEach((k) => el.appendChild(k));
      },
      setAttribute(key, value) { el.attributes[key] = String(value); },
      getAttribute(key) { return key in el.attributes ? el.attributes[key] : null; },
      addEventListener(type, fn) { el.listeners.push({ type, fn }); },
      click() {
        const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
        el.listeners.filter((l) => l.type === 'click').forEach((l) => l.fn(event));
      },
      querySelector(selector) {
        return descendants(el).find((n) => matches(n, selector)) ?? null;
      },
    };
    Object.defineProperty(el, 'nextSibling', {
      get() {
        const p = el.parentElement;
        if (!p) return null;
        return p.children[p.children.indexOf(el) + 1] ?? null;
      },
    });
    return el;
  };

  const html = make('html');
  const head = make('head');
  const body = make('body');
  html.appendChild(head);
  html.appendChild(body);

  // A stand-in for dsh-context's right-hand column: statistics card + sponsor.
  const column = make('div');
  column.className = 'lc-col';
  const stats = make('div');
  stats.className = 'lc-card lc-stats';
  stats.textContent = '上下文统计';
  column.appendChild(stats);
  let ad = null;
  if (withAd) {
    ad = make('a');
    ad.className = 'lc-card lc-recom';
    column.appendChild(ad);
  }
  body.appendChild(column);

  const all = () => descendants(html);
  const document = {
    documentElement: html,
    head,
    body,
    createElement: make,
    getElementById: (id) => all().find((n) => n.id === id) ?? null,
    querySelectorAll: (selector) => all().filter((n) => matches(n, selector)),
    contains: (node) => all().includes(node),
  };
  return { document, column, stats, ad, head, make };
}

function loadBridge({ withAd = true, patchUsage = true } = {}) {
  let descriptor;
  const react = {
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useEffect: () => {},
    createElement: (type, props, ...children) => ({
      type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined),
    }),
  };
  const dom = createFakeDom({ withAd });
  const sandbox = {
    console,
    document: dom.document,
    fetch: async (url) => {
      sandbox.lastFetchUrl = url;
      sandbox.fetchLog.push(url);
      if (url === '/__ctx-bili/status') {
        return { ok: true, status: 200, json: async () => ({ origin: 'http://127.0.0.1:18787', live: true }) };
      }
      return { ok: true, status: 200, json: async () => LEDGER };
    },
    fetchLog: [],
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    __BILI__: { origin: 'http://127.0.0.1:18787', contextTab: false },
    __DSH_CTX_BILI_BRIDGE__: { origin: 'http://127.0.0.1:18787', patchUsage },
  };
  sandbox.window = { __ModuleLoader__: { load: (d) => { descriptor = d; } } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const exports = descriptor.factory((id) => (id === 'react' ? react : {}));
  return { exports, sandbox, react, dom };
}

function makeProjectionStore() {
  const rows = new Map();
  return {
    rows,
    get: (k) => rows.get(k)?.value,
    seqOf: (k) => (rows.get(k)?.kind === 'sequenced' ? rows.get(k).seq : undefined),
    apply: (k, value, seq) => {
      const row = rows.get(k);
      if (row?.kind === 'sequenced' && seq <= row.seq) return;
      rows.set(k, { kind: 'sequenced', value, seq });
    },
  };
}

function makeCtx() {
  const injections = [];
  const registrations = [];
  const effects = [];
  const store = makeProjectionStore();
  const ctx = {
    slots: {
      inject: (name, factory) => { injections.push(name); return factory(); },
      register: (options, component) => { registrations.push({ options, component }); return () => {}; },
    },
    get: (name) => (name === 'sessions'
      ? {
          list: {
            getSnapshot: () => ({
              ids: ['conv-42', 'conv-99'],
              byId: { 'conv-42': {}, 'conv-99': {} },
              phase: 'ready',
            }),
          },
          retainInfo: (id) => ({
            getSnapshot: () => ({ retainedBy: { mainView: id === 'conv-42' ? 1 : 0 } }),
          }),
          binding: (id) => (id === 'conv-42' ? { session: { projections: store } } : undefined),
        }
      : undefined),
    effect: (fn, label) => { effects.push(label); return fn(); },
  };
  return { ctx, injections, registrations, effects, store };
}

const slotOf = (dom) => dom.column.querySelector('[data-dsh-ctx-bili-bridge="slot"]');
const textOf = (el) => (el.textContent || '') + el.children.map(textOf).join(' ');

test('client bundle loads and declares only slots + locale', () => {
  const { exports } = loadBridge();
  assert.equal(typeof exports.apply, 'function');
  // Array.from copies across the vm realm so deepStrictEqual sees our Array prototype.
  assert.deepEqual(Array.from(exports.inject), ['slots', 'locale']);
});

test('registers NO conversation.view tab and no sidebar tab', () => {
  const { exports } = loadBridge();
  const { ctx, injections, registrations } = makeCtx();
  exports.apply(ctx);
  assert.deepEqual(injections, ['shell.overlay']);
  assert.equal(injections.includes('conversation.view'), false);
  assert.equal(injections.includes('sidebar.right.pane.tab'), false);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.name, 'shell.overlay');
});

test('advertising is removed by one scoped CSS rule, node left intact', () => {
  const { exports, dom } = loadBridge();
  const { ctx } = makeCtx();
  exports.apply(ctx);
  const style = dom.head.children.find((n) => n.id === 'dsh-ctx-bili-bridge-style');
  assert.ok(style, 'style element must be injected');
  assert.match(style.textContent, /a\.lc-recom\{display:none!important\}/);
  // We hide, never delete: dsh-context keeps ownership of its own node.
  assert.equal(dom.column.children.includes(dom.ad), true);
});

test('switch card replaces the ad inside the same column, stats untouched', () => {
  const { exports, dom } = loadBridge();
  const { ctx } = makeCtx();
  exports.apply(ctx);
  const card = slotOf(dom);
  assert.ok(card, 'slot card must be mounted');
  assert.equal(card.parentElement, dom.column, 'card lives in the ad column');
  assert.equal(card.nextSibling, null, 'card sits exactly where the ad was');
  assert.equal(dom.ad.nextSibling, card, 'card is inserted right after the hidden ad');
  assert.equal(dom.stats.textContent, '上下文统计', 'statistics card untouched');
  assert.equal(dom.stats.parentElement, dom.column, 'statistics card keeps its place');
  assert.equal(dom.stats.nextSibling, dom.ad, 'only the ad position was taken over');
});

test('card shows billion totals and hit rate, not DSH estimates', async () => {
  const { exports, dom } = loadBridge();
  const { ctx } = makeCtx();
  exports.apply(ctx);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const card = slotOf(dom);
  const text = textOf(card);
  assert.match(text, /压缩账本/);
  assert.match(text, /总用量 10\.0M/);
  assert.match(text, /命中 1\.7K \(0\.02%\)/);
});

test('default state keeps dsh-context visible: panel closed, no iframe', () => {
  const { exports, dom } = loadBridge();
  const { ctx, registrations } = makeCtx();
  exports.apply(ctx);
  const tree = registrations[0].component();
  // Slot mounted → nothing floats over dsh-context at all.
  assert.equal(tree, null);
  assert.equal(dom.document.querySelectorAll('[data-dsh-ctx-bili-bridge="panel"]').length, 0);
});

test('clicking the ad-slot card opens the ledger panel; clicking again closes it', async () => {
  const { exports, dom } = loadBridge();
  const { ctx, registrations } = makeCtx();
  exports.apply(ctx);
  // Let the first poll land so the panel URL carries the matched session.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  slotOf(dom).click();
  const opened = registrations[0].component();
  assert.equal(opened.props['data-dsh-ctx-bili-bridge'], 'backdrop');
  const panel = opened.children.find((c) => c.props['data-dsh-ctx-bili-bridge'] === 'panel');
  assert.ok(panel, 'panel must render after the card is clicked');
  // Pixel sizes, not CSS `min()`: the overlay slot shrinks `min()`-sized
  // children, which is what produced the narrow translucent strip.
  assert.equal(typeof panel.props.style.width, 'number');
  assert.equal(typeof panel.props.style.height, 'number');
  assert.ok(panel.props.style.width > 600);
  const iframe = panel.children.find((c) => c.type === 'iframe');
  // `embed=1` paints the canvas transparent and hides the top bar; the overlay
  // is a full-size surface, so it asks for the normal face plus a theme.
  assert.doesNotMatch(iframe.props.src, /embed=1/);
  assert.match(iframe.props.src, /\/__bili\/\?theme=(dark|light)/);
  assert.match(iframe.props.src, /#\/session\//);
  slotOf(dom).click();
  assert.equal(registrations[0].component(), null);
});

test('ledger is read through the same-origin host proxy, never cross-origin', async () => {
  const { exports, sandbox } = loadBridge();
  const { ctx } = makeCtx();
  exports.apply(ctx);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(sandbox.fetchLog.includes('/__ctx-bili/sessions'), 'must poll the host proxy route');
  assert.equal(
    sandbox.fetchLog.some((url) => String(url).includes('127.0.0.1:18787')),
    false,
    'the page must never call the CORS-less upstream directly',
  );
});

test('without an ad slot nothing floats (fallback removed 2026-11-13)', () => {
  const { exports, dom } = loadBridge({ withAd: false });
  const { ctx, registrations } = makeCtx();
  exports.apply(ctx);
  assert.equal(slotOf(dom), null);
  assert.equal(registrations[0].component(), null, 'no floating fallback button by design');
});

test('shim writes billion usage into the current session projection store', async () => {
  const { exports, dom } = loadBridge();
  const { ctx, store } = makeCtx();
  // A host-computed native row already exists at seq 10.
  store.apply('tokenUsage', { uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 }, 10);
  exports.apply(ctx);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const row = store.rows.get('tokenUsage');
  assert.ok(row, 'tokenUsage row must exist');
  assert.equal(row.kind, 'sequenced');
  assert.ok(row.seq > 10, 'the billion write must outrank the native row');
  // billion's numbers, not the native 1/2/3/4.
  assert.equal(row.value.uncachedInputTokens, 9879258 - 1728);
  assert.equal(row.value.cacheReadTokens, 1728);
  assert.equal(row.value.outputTokens, 130106);
  assert.equal(row.value.cacheWriteTokens, 0);
  // The card reports the takeover instead of 垫片未接管.
  assert.match(textOf(slotOf(dom)), /已接管统计卡/);
});

test('shim leaves the store untouched when patchUsage is off', async () => {
  const { exports } = loadBridge({ patchUsage: false });
  const { ctx, store } = makeCtx();
  store.apply('tokenUsage', { uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 }, 10);
  exports.apply(ctx);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.rows.get('tokenUsage').value.uncachedInputTokens, 1, 'native row must survive');
});
