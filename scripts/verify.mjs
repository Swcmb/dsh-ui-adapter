// dsh-context-bili-bridge  —  installation verifier
// Copyright (C) 2026  Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Read-only checks against a real profile. Nothing here writes to the profile,
// to dsh-context, or to billion-context. It answers one question per step and
// exits non-zero if any hard check fails.
//
//   node scripts/verify.mjs --profile <profile-dir>
//   node scripts/verify.mjs --profile <dir> --compose   (also run dsh --dump-config)
//
// What it can NOT prove: how the panel looks on screen. That needs a page load
// in the running DSH window (Ctrl+R) — the renderer talks to the host over the
// dsh-app:// scheme with a per-launch token, so there is no offline way in.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PKG = 'dsh-context-bili-bridge';
// Keep the verifier's host-half imports out of the running process's log.
process.env.DSH_CTX_BILI_BRIDGE_LOG = '0';
const argv = process.argv.slice(2);
const profileArg = (() => {
  const i = argv.indexOf('--profile');
  return i >= 0 ? argv[i + 1] : '';
})();
if (!profileArg) {
  console.error('usage: node scripts/verify.mjs --profile <profile-dir> [--compose]');
  process.exit(2);
}
const profile = path.resolve(profileArg);
const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

// 1 — registered as a bundle in the profile manifest ---------------------------
check('profile registers the bundle', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'));
  const bundles = pkg?.dsh?.profile?.bundles ?? [];
  const dep = pkg?.dependencies?.[PKG];
  if (!bundles.includes(PKG)) throw new Error(`"${PKG}" missing from dsh.profile.bundles`);
  if (!dep) throw new Error(`"${PKG}" missing from dependencies`);
  return `${dep} · bundle #${bundles.indexOf(PKG) + 1}/${bundles.length}`;
});

// 2 — the installed copy resolves to this repository --------------------------
check('installed package resolves', () => {
  const req = createRequire(path.join(profile, 'package.json'));
  const main = req.resolve(PKG);
  const client = req.resolve(`${PKG}/client`);
  if (!fs.existsSync(client)) throw new Error(`client bundle missing: ${client}`);
  return `${main} · ${client}`;
});

// 3 — the bundle patch declares exactly one insert row ------------------------
check('cordis.patch.yml declares the host row', () => {
  const req = createRequire(path.join(profile, 'package.json'));
  let yamlPath;
  try { yamlPath = req.resolve('js-yaml'); } catch { /* fall through */ }
  if (!yamlPath) return 'skipped (js-yaml not resolvable from the profile)';
  const yaml = req('js-yaml');
  const doc = yaml.load(fs.readFileSync(path.join(profile, 'node_modules', PKG, 'cordis.patch.yml'), 'utf8'));
  const row = Array.isArray(doc) ? doc.flatMap((e) => e.insert ?? []).find((r) => r.id === PKG) : null;
  if (!row) throw new Error('no insert row for the bridge');
  if (row.name !== PKG) throw new Error(`row name is "${row.name}"`);
  return `insert ${row.id} -> ${row.name}`;
});

// 4 — the host half imports and publishes config ------------------------------
check('host half imports and publishes config', async () => {
  const mod = await import(pathToFileURL(path.join(profile, 'node_modules', PKG, 'lib', 'index.js')).href);
  if (mod.name !== PKG) throw new Error(`unexpected name: ${mod.name}`);
  // Regression guard: Cordis only exposes a service on the plugin context when
  // the module declares it. Without this row `ctx.webServer` throws, the route
  // is never registered, and the panel says "billion 未运行" while the proxy is
  // healthy. That failure is silent unless a check looks for it.
  const declared = Array.isArray(mod.inject) ? mod.inject : [];
  if (!declared.includes('webServer')) throw new Error(`module inject must declare 'webServer' (got ${JSON.stringify(mod.inject)})`);
  const table = [];
  mod.apply({ on: (event, fn) => { if (event === 'webserver/index-inject') fn(table); } });
  const row = table.find((r) => r.name === '__DSH_CTX_BILI_BRIDGE__');
  if (!row) throw new Error('config was not published');
  return `inject=${declared.join(',')} · published origin=${row.value.origin}`;
});

// 5 — the host half exposes the same-origin ledger routes ---------------------
check('host half registers the same-origin ledger routes', async () => {
  const mod = await import(pathToFileURL(path.join(profile, 'node_modules', PKG, 'lib', 'index.js')).href);
  const registered = [];
  const webServer = { register: (route) => { registered.push(route); return () => {}; } };
  // Mirror the real contract: `ctx.webServer` is a plain property once the
  // module declares the service, and `ctx.effect` wraps the disposer.
  mod.apply({
    webServer,
    on() {},
    effect: (fn) => { const off = fn(); return typeof off === 'function' ? off() : undefined; },
  });
  const paths = registered.map((r) => r.path);
  if (!paths.includes('/__ctx-bili/sessions')) throw new Error(`sessions route missing (got ${paths.join(', ') || 'none'})`);
  if (!paths.includes('/__ctx-bili/status')) throw new Error('status route missing');
  if (!paths.includes('/__ctx-bili/diag')) throw new Error('diag route missing');
  // billion sends no CORS header, so the page MUST NOT poll it directly.
  const client = fs.readFileSync(path.join(profile, 'node_modules', PKG, 'lib', 'client.js'), 'utf8');
  if (!client.includes("'/__ctx-bili/sessions'")) throw new Error('client does not poll the host proxy');
  if (/fetch\(`\$\{origin\}\/__bili\/sessions`/.test(client)) throw new Error('client still calls the upstream cross-origin');
  // The sessions service must be acquired via runtime inject (the form
  // dsh-context's own client uses in this plane); without it the usage shim
  // can never take over the statistics card.
  if (!client.includes("ctx.inject(['sessions']")) throw new Error('client does not runtime-inject the sessions service');
  return paths.join(' · ');
});

// 6 — the client bundle mounts its card over the ad slot ----------------------
check('client bundle hides the ad and mounts the switch', () => {
  const source = fs.readFileSync(path.join(profile, 'node_modules', PKG, 'lib', 'client.js'), 'utf8');
  const dom = miniDom();
  let descriptor;
  const react = {
    useSyncExternalStore: (_s, get) => get(),
    useEffect: () => {},
    createElement: (type, props, ...kids) => ({ type, props: props ?? {}, children: kids.flat().filter((k) => k != null) }),
  };
  const sandbox = {
    console, document: dom.document,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ sessions: [{ id: 's1', conversationId: 'c1', inputTokens: 100, cachedTokens: 40, outputTokens: 5 }] }) }),
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {},
  };
  sandbox.window = { __ModuleLoader__: { load: (d) => { descriptor = d; } } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const exports = descriptor.factory((id) => (id === 'react' ? react : {}));
  const regs = [];
  exports.apply({
    slots: { inject: (_n, f) => f(), register: (o, c) => { regs.push({ o, c }); } },
    get: (n) => (n === 'sessions' ? { list: { getSnapshot: () => ({ current: 'c1' }) } } : undefined),
    effect: (fn) => fn(),
    sessionProjections: { register: (p) => p, entries: new Map() },
  });
  const style = dom.head.children.find((n) => n.id === 'dsh-ctx-bili-bridge-style');
  if (!style) throw new Error('no style element injected');
  if (!/a\.lc-recom\{display:none!important\}/.test(style.textContent)) throw new Error('ad hiding rule missing');
  const card = dom.column.children.find((n) => n.attributes['data-dsh-ctx-bili-bridge'] === 'slot');
  if (!card) throw new Error('switch card not mounted');
  if (card.parentElement !== dom.column) throw new Error('card mounted outside the ad column');
  if (dom.ad.nextSibling !== card) throw new Error('card is not in the ad position');
  if (!dom.column.children.includes(dom.stats)) throw new Error('statistics card was removed');
  card.listeners.filter((l) => l.type === 'click').forEach((l) => l.fn({ preventDefault() {}, stopPropagation() {} }));
  const tree = regs[0].c();
  const panel = tree.children.find((c) => c.props['data-dsh-ctx-bili-bridge'] === 'panel');
  if (!panel) throw new Error('click did not open the ledger panel');
  return 'ad hidden · card in slot · stats untouched · panel opens';
});

// 6 — billion-context's duplicate tab is switched off ------------------------
check('billion-context context tab disabled', () => {
  const file = process.env.BILI_CONFIG_FILE
    || path.join(os.homedir(), '.config', 'billion-context', 'billion-context.json');
  if (!fs.existsSync(file)) throw new Error(`config not found: ${file}`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data?.dsh?.contextTab !== false) throw new Error(`dsh.contextTab is ${JSON.stringify(data?.dsh?.contextTab)} (run scripts/setup.mjs)`);
  return `${file} · dsh.contextTab=false · label=${JSON.stringify(data?.dsh?.contextTabLabel ?? 'built-in 上下文')}`;
});

// 7 — optional: the platform itself composes our row -------------------------
if (argv.includes('--compose')) {
  check('dsh --dump-config composes the row', () => {
    const alias = path.join(path.dirname(profile), 'bridge-verify');
    try { fs.rmSync(alias, { recursive: true, force: true }); } catch { /* ignore */ }
    fs.symlinkSync(profile, alias, 'junction');
    try {
      const out = execFileSync('dsh', ['--profile', path.basename(alias), '--dump-config'], {
        encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
        // `dsh` is a .cmd shim on Windows.
        shell: process.platform === 'win32',
      });
      if (!out.includes(`- id: ${PKG}`)) throw new Error('row absent from the composed tree');
      return 'row present in composed profile tree';
    } finally {
      fs.rmSync(alias, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------
function miniDom() {
  const desc = (n) => n.children.flatMap((c) => [c, ...desc(c)]);
  const matches = (el, sel) => {
    if (sel === 'a.lc-recom') return el.tagName === 'A' && String(el.className).split(/\s+/).includes('lc-recom');
    const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
    return m ? el.attributes[m[1]] === m[2] : false;
  };
  const make = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), children: [], attributes: {}, className: '', textContent: '', id: '', type: '', style: {},
      parentElement: null, listeners: [],
      appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
      insertBefore(c, ref) {
        c.parentElement = el;
        const at = ref ? el.children.indexOf(ref) : -1;
        if (at < 0) el.children.push(c); else el.children.splice(at, 0, c);
        return c;
      },
      replaceChildren(...kids) { el.children = []; kids.forEach((k) => el.appendChild(k)); },
      remove() { if (el.parentElement) el.parentElement.children = el.parentElement.children.filter((k) => k !== el); },
      setAttribute(k, v) { el.attributes[k] = String(v); },
      getAttribute(k) { return el.attributes[k] ?? null; },
      addEventListener(t, fn) { el.listeners.push({ type: t, fn }); },
      querySelector(sel) { return desc(el).find((n) => matches(n, sel)) ?? null; },
    };
    Object.defineProperty(el, 'nextSibling', {
      get() {
        const p = el.parentElement;
        return p ? p.children[p.children.indexOf(el) + 1] ?? null : null;
      },
    });
    return el;
  };
  const html = make('html'); const head = make('head'); const body = make('body');
  html.appendChild(head); html.appendChild(body);
  const column = make('div'); column.className = 'lc-col';
  const stats = make('div'); stats.className = 'lc-card lc-stats'; stats.textContent = '统计';
  const ad = make('a'); ad.className = 'lc-card lc-recom';
  column.appendChild(stats); column.appendChild(ad);
  body.appendChild(column);
  const all = () => desc(html);
  return {
    document: {
      documentElement: html, head, body, createElement: make,
      getElementById: (id) => all().find((n) => n.id === id) ?? null,
      querySelectorAll: (sel) => all().filter((n) => matches(n, sel)),
      contains: (n) => all().includes(n),
    },
    column, stats, ad, head,
  };
}

// ---------------------------------------------------------------------------
const results = [];
for (const { name, fn } of checks) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
  if (!r.ok) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
console.log('NOT RUN: on-screen result. RESTART the DSH process (not just Ctrl+R) — the same-origin');
console.log('ledger routes are registered by the host half at start-up. Then look at 上下文:');
console.log('  · the sponsor card (Zilliz Cloud / DeepSeek / PowerContext) is gone');
console.log('  · a 压缩账本 card fills that slot with billion totals + hit rate');
console.log('  · clicking it opens a full-size, opaque ledger panel; Esc closes it');
console.log('  · only one 上下文 tab remains in the top bar');
console.log('');
console.log('If it still says billion 未运行, read .host.log next to this package:');
console.log('  · no `apply:enter`            -> the host half never loaded (profile/bundle problem)');
console.log('  · `bind:no-webserver`         -> module `inject` does not declare webServer');
console.log('  · `route:hit` rows present    -> the page IS polling; the fault is in rendering');
console.log('  · no `route:hit` at all       -> the page is not reaching the route (reload the page)');
process.exit(failed === 0 ? 0 : 1);
