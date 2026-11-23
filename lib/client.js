// dsh-ui-adapter — unified classic-script client bundle (fused plugin suite)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// DSH injects lib/client.js as a classic script, not an ES module, so both
// client IIFEs are inlined verbatim below: adapter first, session-panel second.

// dsh-ui-adapter  —  client half (DSH web module loader bundle)
// Copyright (C) 2026  Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

window.__ModuleLoader__.load({
  id: '@ianwusb/dsh-ui-adapter',
  factory: (require) => {
    'use strict';
    const module = { exports: {} };
    const React = require('react');

    const inject = ['slots', 'locale'];
    const DEFAULTS = {
      origin: 'http://127.0.0.1:18787',
      pollMs: 5000,
      patchUsage: true,
      switchLabel: '压缩账本',
      lang: 'zh',
    };
    // Host-proxy routes (lib/proxy.mjs). Same origin as the page, so no CORS.
    const SESSIONS_ROUTE = '/__ctx-bili/sessions';
    const STATUS_ROUTE = '/__ctx-bili/status';
    const DIAG_ROUTE = '/__ctx-bili/diag';

    // dsh-context renders its sponsor slot as <a class="lc-card lc-recom"> inside
    // the same column as the "插件信息" card. That anchor is the ONLY node this
    // bundle hides or replaces; every other dsh-context node is left alone.
    const AD_SELECTOR = 'a.lc-recom';
    const FLAG = 'data-dsh-ctx-bili-bridge';
    const STYLE_ID = 'dsh-ctx-bili-bridge-style';
    const SLOT_GRACE_MS = 8000;
    const RESYNC_MS = 1500;

    // The sponsor anchor is replaced in place, so the button inherits the ad
    // slot's box. The slot is taller than three text rows, which is why the card
    // looked half-empty: stretch to the slot and centre the content vertically.
    const SLOT_CSS = [
      `${AD_SELECTOR}{display:none!important}`,
      `[${FLAG}="slot"]{display:flex;flex-direction:column;justify-content:space-evenly;`
        + 'gap:3px;width:100%;height:100%;align-self:stretch;box-sizing:border-box;'
        + 'text-align:left;cursor:pointer;font:inherit;font-size:12px;color:inherit;margin:0;'
        + 'border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:8px 10px;'
        + 'background:rgba(127,127,127,.06);overflow:hidden}',
      `[${FLAG}="slot"]:hover{background:rgba(127,127,127,.13)}`,
      `[${FLAG}="slot"] .lc-bili-head{display:flex;align-items:center;gap:6px;min-width:0}`,
      `[${FLAG}="slot"] .lc-bili-label{font-weight:600;white-space:nowrap}`,
      `[${FLAG}="slot"] .lc-bili-hint{margin-left:auto;opacity:.55;font-size:11px;white-space:nowrap}`,
      `[${FLAG}="slot"] .lc-bili-metrics{opacity:.9;font-variant-numeric:tabular-nums;`
        + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      `[${FLAG}="slot"] .lc-bili-detail{opacity:.62;font-size:11px;`
        + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      `[${FLAG}="slot"] .lc-bili-source{opacity:.45;font-size:11px;`
        + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    ].join('\n');

    // Cross-plugin UI patches (other plugins' DOM): dsh-btw icons,
    // dsh-claude-style fade bands, dsh-context sponsor card. Plain CSS only —
    // a stale selector can fail to hide something, it never breaks the page.
    const UI_PATCH_CSS = [
      // UI-7: drop the transcript / composer fade bands (claude-style vars).
      'body[data-dsh-claude-style]{--dsh-transcript-fade-h:0px!important;--dsh-composer-fade-h:0px!important}',
      // UI-4: hide dsh-btw's bottom / global entry buttons + the input-area chip.
      '.dsh-btw-entry,.dsh-btw-global-entry,.dsh-btw-chip{display:none!important}',
      // UI-1: hard-hide dsh-context's sponsor card even if the slot swap fails.
      'a.lc-card.lc-recom{display:none!important}',
      // UI-6: separate the model dropdown from the context-usage ring.
      '[aria-label^="选择模型"]{margin-right:8px!important}'
        + '[aria-label^="上下文已用"]{margin-left:8px!important}',
      // UI-3: narrow the claude-style session panel (会话详情) to the target width.
      // Must out-specify claude-style's `body[data-dsh-claude-style] .dsh-claude-details`.
      'body[data-dsh-claude-style] aside.dsh-claude-details,'
        + 'body[data-dsh-claude-style] aside.dsh-claude-details .dsh-claude-details-body'
        + '{width:290px!important;flex:none!important;min-width:0!important}',
      // UI-8: park the view tabs back under the title AND keep DSH's native
      // tab look. claude-style's viewTabs feature pins the native
      // `[data-dsh-view-tabs]` strip into the title bar (`position:fixed`,
      // keyed on the header's `data-dsh-titlebar-tabs` marker) and re-skins
      // the inner `[data-conversation-tabs]` tablist into a centred pill
      // switch with the active tab's underline removed. parkViewTabs() strips
      // those markers off the DOM; these backstops hold the native geometry
      // and underline during the short window between claude-style re-adding
      // a marker and the observer clearing it again.
      'body[data-dsh-claude-style] [data-dsh-titlebar-tabs] [data-dsh-view-tabs]{'
        + 'position:static!important;top:auto!important;left:auto!important;'
        + 'transform:none!important;z-index:auto!important;margin:0!important}',
      'body[data-dsh-claude-style] [data-dsh-view-tabs]{'
        + 'justify-content:flex-start!important;align-items:flex-start!important;'
        + 'gap:16px 20px!important;padding-left:8px!important;flex-wrap:wrap!important}',
      'body[data-dsh-claude-style] [data-dsh-view-tabs] [data-conversation-tabs]{'
        + 'place-self:auto!important;width:auto!important;transform:none!important}',
      'body[data-dsh-claude-style] [data-dsh-view-tabs] .an3WzG_viewTabs{'
        + 'flex-wrap:wrap!important;min-height:25px!important}',
      'body[data-dsh-claude-style] [data-dsh-view-tabs] .an3WzG_tab{'
        + 'margin:-10px calc(-1 * var(--dsh-tab-hit-inline,10px)) 0!important;'
        + 'height:auto!important;min-height:35px!important;'
        + 'padding:10px var(--dsh-tab-hit-inline,10px) 9px!important}',
      'body[data-dsh-claude-style] [data-dsh-view-tabs] .an3WzG_tab::after{display:block!important}',
    ].join('\n');
    const PATCH_STYLE_ID = 'dsh-ui-adapter-patch';

    // Kept in sync with lib/ledger.mjs. This bundle cannot import an ESM
    // sibling through the web module loader, so the small mapping is inlined.
    const finite = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    function toUsage(s) {
      if (!s || typeof s !== 'object') return null;
      const input = finite(s.inputTokens);
      const cached = finite(s.cachedTokens);
      if (input === 0 && cached === 0 && finite(s.outputTokens) === 0) return null;
      const cacheRead = Math.min(cached, input);
      return {
        uncachedInputTokens: Math.max(0, input - cacheRead),
        outputTokens: finite(s.outputTokens),
        cacheReadTokens: cacheRead,
        cacheWriteTokens: 0,
      };
    }
    /**
     * Session matching, kept in sync with lib/ledger.mjs. billion labels a
     * session `session-<uuid>` and suffixes sub-agents with `|sub:<hash>`, while
     * DSH hands us the bare id — the raw strings never match, which used to read
     * as "billion 未运行".
     */
    function normalizeSessionKey(value) {
      if (typeof value !== 'string') return '';
      let key = value.trim();
      if (!key) return '';
      const pipe = key.indexOf('|');
      if (pipe !== -1) key = key.slice(0, pipe);
      if (key.startsWith('session-')) key = key.slice('session-'.length);
      return key.trim().toLowerCase();
    }
    const keysOf = (s) => [s?.conversationId, s?.hostSessionId, s?.id, s?.label]
      .map(normalizeSessionKey).filter(Boolean);
    const lastSeenOf = (s) => Date.parse(s?.lastSeen ?? '') || 0;

    function pickSessionDetailed(payload, conversationId) {
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.sessions) ? payload.sessions : [];
      if (!list.length) return { session: null, match: 'none' };
      const needle = normalizeSessionKey(conversationId);
      if (needle) {
        const exact = list.find((s) => keysOf(s).includes(needle));
        if (exact) return { session: exact, match: 'exact' };
        const loose = list.find((s) => keysOf(s).some((k) => k.includes(needle) || needle.includes(k)));
        if (loose) return { session: loose, match: 'loose' };
      }
      if (list.length === 1) return { session: list[0], match: 'fallback' };
      const newest = [...list].sort((a, b) => lastSeenOf(b) - lastSeenOf(a))[0];
      return newest ? { session: newest, match: 'fallback' } : { session: null, match: 'none' };
    }

    function readConfig() {
      const raw = globalThis.__DSH_CTX_BILI_BRIDGE__;
      const r = raw && typeof raw === 'object' ? raw : {};
      return {
        origin: typeof r.origin === 'string' && r.origin.trim()
          ? r.origin.trim().replace(/\/+$/, '') : DEFAULTS.origin,
        pollMs: Number.isFinite(r.pollMs) && r.pollMs >= 1000 ? Math.floor(r.pollMs) : DEFAULTS.pollMs,
        patchUsage: r.patchUsage !== false,
        switchLabel: typeof r.switchLabel === 'string' && r.switchLabel.trim()
          ? r.switchLabel.trim() : DEFAULTS.switchLabel,
        lang: typeof r.lang === 'string' && r.lang.trim() ? r.lang.trim() : DEFAULTS.lang,
      };
    }

    function readOrigin(cfg) {
      const bili = globalThis.__BILI__;
      if (bili && bili.relay === true) return '';
      if (bili && typeof bili.origin === 'string' && bili.origin.length > 0) return bili.origin.replace(/\/+$/, '');
      return cfg.origin;
    }

    /**
     * billion-context publishes its proxy origin on /bili/origin as JSON:
     * `{origin:"http://127.0.0.1:<port>"}`, or `{relay:true}` when its same-origin
     * admin relay is enabled (then `""` means "use this page's origin").
     * The previous version only inspected the redirect URL and ignored the body,
     * so a `{relay:true}` answer fell back to the hard-coded 18787 and every
     * request was then blocked by CORS.
     */
    async function discoverOrigin(cfg) {
      const known = readOrigin(cfg);
      if (known !== cfg.origin || globalThis.__BILI__?.relay === true) return known;
      try {
        const res = await fetch('/bili/origin', { redirect: 'follow', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.relay === true) return '';
          if (typeof data?.origin === 'string' && data.origin.trim()) return data.origin.trim().replace(/\/+$/, '');
        }
      } catch { /* keep the default */ }
      return known;
    }

    /**
     * The sessions service lives at the client app's root
     * (rootCtx.reflect.provide("sessions", ...) in session-controller.client),
     * but a plugin client half only sees services it injects. dsh-context's
     * own client acquires `configForms` with the RUNTIME form
     * ctx.inject(['configForms'], cb) in this same plane, so we do the same
     * for 'sessions' and keep property/get probes as fallbacks. Which path
     * actually worked is reported to DIAG_ROUTE for .host.log.
     */
    const sessionsBox = { svc: undefined, via: 'none' };
    function adoptSessions(svc, via) {
      if (svc && typeof svc.binding === 'function') {
        sessionsBox.svc = svc;
        sessionsBox.via = via;
      }
    }
    function bindSessions(ctx) {
      if (typeof ctx.inject === 'function') {
        try {
          ctx.inject(['sessions'], (sub) => {
            // dsh-context's callback reads the service as a property of the
            // injected context (t.configForms), so mirror that shape here.
            adoptSessions(sub?.sessions, 'runtime-inject');
            adoptSessions(sub, 'runtime-inject');
          });
        } catch { /* keep the probes below */ }
      }
      if (!sessionsBox.svc) {
        try { adoptSessions(ctx.sessions, 'ctx.sessions'); } catch { /* throws on Cordis ctx */ }
      }
      if (!sessionsBox.svc && typeof ctx.get === 'function') {
        try { adoptSessions(ctx.get('sessions'), 'ctx.get'); } catch { /* service absent */ }
      }
    }
    function sessionsOf(ctx) {
      return sessionsBox.svc
        ?? (typeof ctx.get === 'function' ? safeGet(ctx, 'sessions') : undefined);
    }
    function safeGet(obj, key) {
      try { return obj.get(key); } catch { return undefined; }
    }

    /**
     * Which conversation is the panel about. The sessions list snapshot has
     * NO `.current` field (its shape is {ids, byId, phase, projectionsBySession}),
     * so "the session the main view holds" is read the way the shipped
     * ui-agent-preset code does: retainInfo(id).retainedBy.mainView > 0.
     */
    function conversationIdOf(ctx) {
      const sessions = sessionsOf(ctx);
      try {
        const list = sessions?.list;
        const snap = typeof list?.getSnapshot === 'function' ? list.getSnapshot() : undefined;
        const byId = snap?.byId;
        if (byId && typeof byId === 'object') {
          const ids = Array.isArray(snap.ids) ? snap.ids.filter(Boolean) : Object.keys(byId);
          if (ids.length === 1) return ids[0];
          if (ids.length > 1 && typeof sessions?.retainInfo === 'function') {
            const held = ids.filter((id) => {
              try {
                const info = sessions.retainInfo(id);
                const r = typeof info?.getSnapshot === 'function' ? info.getSnapshot() : undefined;
                return (r?.retainedBy?.mainView ?? 0) > 0;
              } catch { return false; }
            });
            if (held.length > 0) return held[held.length - 1];
          }
        }
      } catch { /* fall through */ }
      const fromBili = globalThis.__BILI__?.sessionId;
      return typeof fromBili === 'string' ? fromBili : '';
    }

    const listeners = new Set();
    let state = {
      usage: null, sessionId: null, origin: '', open: false,
      // connection: 'idle' | 'ok' | 'fail'. Distinct from `match`: billion can
      // be perfectly healthy while this conversation has no ledger yet.
      connection: 'idle', match: 'none', sessionCount: 0, model: null,
      error: null, shim: 'pending', slot: 'pending', lastPoll: 0,
    };
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
    const getSnapshot = () => state;
    const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };

    function compact(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return String(n);
    }

    /** Totals / hit rate straight from billion's ledger. */
    function readout(s) {
      if (s.connection === 'fail') {
        return {
          metrics: 'billion 账本未连接',
          detail: '',
          source: s.error ? `同源代理失败：${s.error}` : '检查 billion 代理是否在运行',
        };
      }
      if (!s.usage) {
        if (s.connection === 'ok') {
          const n = s.sessionCount;
          return {
            metrics: n > 0 ? `已连接 billion · 共 ${n} 个账本` : '已连接 billion · 账本为空',
            detail: '',
            source: '当前会话还没有账本，发出一次请求后出现',
          };
        }
        return { metrics: '读取 billion 账本…', detail: '', source: '等待第一次响应' };
      }
      const cacheRead = finite(s.usage.cacheReadTokens);
      const billed = finite(s.usage.uncachedInputTokens) + cacheRead + finite(s.usage.cacheWriteTokens);
      const total = billed + finite(s.usage.outputTokens);
      const rate = billed > 0 ? (cacheRead / billed) * 100 : 0;
      const which = s.match === 'exact' ? '' : s.match === 'loose' ? '近似匹配' : '最新会话';
      return {
        metrics: `总用量 ${compact(total)} · 命中 ${compact(cacheRead)} (${rate.toFixed(2)}%)`,
        detail: [s.sessionCount ? `${s.sessionCount} 个账本` : '', s.model ?? '', which].filter(Boolean).join(' · '),
        source: s.shim === 'active' ? '数据源：billion 账本（已接管统计卡）'
          : s.shim === 'off' ? '数据源：DSH 原生（垫片已关闭）'
            : `数据源：billion 账本（统计卡未接管：${s.shim === 'none' || s.shim === 'pending' ? '暂无账本' : s.shim}）`,
      };
    }

    /**
     * Data-source shim. dsh-context reads its token card via
     * useProjection('tokenUsage'), which resolves through the current
     * session's ProjectionValueStore — reachable in a client plugin as
     * sessions.binding(sessionId).session.projections (the same path the
     * shipped ui-chat code uses for 'workingDirectory'). The store's
     * documented write API is apply(key, value, seq) with higher-seq-wins, so
     * writing at seqOf+1 makes the billion ledger outrank the host-computed
     * native value without touching dsh-context's code, components or DOM.
     * The value keeps the four finite fields dsh-context validates (Qe).
     * Returns 'active' on success, otherwise a short reason for the card.
     */
    function writeUsageProjection(ctx, usage) {
      if (!usage) return state.shim === 'off' ? 'off' : 'none';
      const sessions = sessionsOf(ctx);
      if (!sessions || typeof sessions.binding !== 'function') return '无 sessions 服务';
      const id = conversationIdOf(ctx);
      if (!id) return '未找到当前会话';
      let binding;
      try {
        binding = sessions.binding(id);
      } catch {
        return '会话绑定失败';
      }
      const store = binding?.session?.projections;
      if (!store || typeof store.apply !== 'function') return '投影 store 不可用';
      try {
        const base = typeof store.get === 'function' ? store.get('tokenUsage') : undefined;
        const value = { ...(base && typeof base === 'object' ? base : {}), ...usage };
        const seq = (typeof store.seqOf === 'function' ? store.seqOf('tokenUsage') : undefined);
        store.apply('tokenUsage', value, (typeof seq === 'number' ? seq : 0) + 1);
        return 'active';
      } catch {
        return '写入失败';
      }
    }

    /**
     * Ad-slot controller.
     *
     * The sponsor card (a.lc-recom) is hidden by one CSS rule and replaced, in
     * place, by a sibling <button> inside the very same column. Nothing else in
     * dsh-context is hidden, moved, unmounted or rewritten: the statistics
     * panel, the event list and the context browser keep rendering themselves.
     */
    function createSlot(cfg) {
      const doc = typeof document !== 'undefined' && document ? document : null;
      let card = null;
      let observer = null;
      let debounce = null;
      let resync = null;
      let startedAt = Date.now();
      let quietUntil = 0;
      // Once the card has lived in the ad slot we never grow a floating twin:
      // navigating away from dsh-context's overview simply hides the switch with
      // the panel it belongs to.
      let everMounted = false;
      const unsubscribe = subscribe(() => paint());

      function ensureStyle() {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = SLOT_CSS;
        (doc.head || doc.documentElement).appendChild(style);
      }

      function paint() {
        if (!card) return;
        const s = getSnapshot();
        const { metrics, detail, source } = readout(s);
        const signature = `${cfg.switchLabel}|${metrics}|${detail}|${source}`;
        if (card.__bridgeSignature === signature) return;
        card.__bridgeSignature = signature;

        const head = doc.createElement('span');
        head.className = 'lc-bili-head';
        const label = doc.createElement('span');
        label.className = 'lc-bili-label';
        label.textContent = cfg.switchLabel;
        const hint = doc.createElement('span');
        hint.className = 'lc-bili-hint';
        hint.textContent = s.open ? '收起 ▾' : '打开 ▸';
        head.appendChild(label);
        head.appendChild(hint);

        const metricsEl = doc.createElement('span');
        metricsEl.className = 'lc-bili-metrics';
        metricsEl.textContent = metrics;

        // The ad slot is roughly four text rows tall. Without a fourth line the
        // replacement card looked half-empty inside it.
        const detailEl = doc.createElement('span');
        detailEl.className = 'lc-bili-detail';
        detailEl.textContent = detail;
        detailEl.style.display = detail ? '' : 'none';

        const sourceEl = doc.createElement('span');
        sourceEl.className = 'lc-bili-source';
        sourceEl.textContent = source;

        card.replaceChildren(head, metricsEl, detailEl, sourceEl);
        card.setAttribute('title', `${metrics}｜${source}｜点击切换 billion 账本面板`);
        card.setAttribute('aria-expanded', s.open ? 'true' : 'false');
      }

      function build() {
        const button = doc.createElement('button');
        button.type = 'button';
        button.setAttribute(FLAG, 'slot');
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          emit({ open: !getSnapshot().open });
        });
        return button;
      }

      function sync() {
        if (!doc) {
          if (getSnapshot().slot !== 'unavailable') emit({ slot: 'unavailable' });
          return;
        }
        ensureStyle();
        const ads = doc.querySelectorAll(AD_SELECTOR);
        let mounted = false;
        for (let i = 0; i < ads.length; i += 1) {
          const ad = ads[i];
          const parent = ad.parentElement;
          if (!parent) continue;
          let node = parent.querySelector(`[${FLAG}="slot"]`);
          if (!node) {
            node = build();
            quietUntil = Date.now() + 100;
            parent.insertBefore(node, ad.nextSibling);
          }
          card = node;
          mounted = true;
        }
        if (card && typeof doc.contains === 'function' && !doc.contains(card)) card = null;
        paint();
        if (mounted) everMounted = true;
        const next = mounted ? 'mounted'
          : (!everMounted && Date.now() - startedAt > SLOT_GRACE_MS ? 'fallback' : 'pending');
        if (getSnapshot().slot !== next) emit({ slot: next });
      }

      function start() {
        if (!doc) { sync(); return; }
        sync();
        if (typeof MutationObserver === 'function') {
          observer = new MutationObserver(() => {
            if (Date.now() < quietUntil) return;
            if (debounce) return;
            debounce = setTimeout(() => { debounce = null; sync(); }, 60);
          });
          observer.observe(doc.documentElement, { childList: true, subtree: true });
        }
        // Safety net: a removed card or a late-rendered panel is re-picked up
        // even if a mutation batch is missed during a heavy re-render.
        resync = setInterval(() => {
          if (!card || (typeof doc.contains === 'function' && !doc.contains(card))) sync();
        }, RESYNC_MS);
      }

      function stop() {
        unsubscribe();
        if (observer) observer.disconnect();
        if (debounce) clearTimeout(debounce);
        if (resync) clearInterval(resync);
        if (card && card.parentElement) card.remove();
        card = null;
      }

      return { start, stop, sync };
    }

    function themeOf() {
      const doc = typeof document !== 'undefined' ? document : null;
      const attr = doc?.documentElement?.getAttribute('data-theme');
      if (attr === 'light' || attr === 'dark') return attr;
      try {
        if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      } catch { /* fall through */ }
      return 'dark';
    }

    /**
     * `?embed=1` is billion's narrow "inside a host settings page" face and it
     * paints the canvas transparent — the reason the panel looked like an empty
     * sheet of glass. Use the normal face with an explicit theme instead.
     */
    function panelUrl(origin, sessionId, theme) {
      const hash = sessionId ? `#/session/${encodeURIComponent(sessionId)}` : '#/sessions';
      return `${origin || ''}/__bili/?theme=${theme}${hash}`;
    }

    /** Overlay: the ledger panel plus a fallback button when no ad slot exists. */
    function buildOverlay(ctx, slot) {
      return function BridgeOverlay() {
        const s = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
        const cfg = readConfig();
        const theme = themeOf();
        const dark = theme === 'dark';
        const origin = s.origin || readOrigin(cfg);
        const url = panelUrl(origin, s.sessionId, theme);
        const { metrics, source } = readout(s);

        const surface = dark ? '#151517' : '#ffffff';
        const ink = dark ? '#e9e9ec' : '#1a1a1c';
        const line = dark ? 'rgba(255,255,255,.16)' : 'rgba(15,23,42,.14)';
        const btn = {
          cursor: 'pointer', border: `1px solid ${line}`,
          borderRadius: 8, background: 'transparent',
          color: 'inherit', padding: '4px 10px', fontSize: 12,
        };

        // Sized in pixels rather than CSS `min()`: the overlay slot is hosted in
        // a flex container that shrinks its children, and a `min()`-sized panel
        // collapsed into a narrow strip (the "transparent little window").
        const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 900;
        const panelW = Math.min(1180, Math.round(vw * 0.94));
        const panelH = Math.min(840, Math.round(vh * 0.92));

        React.useEffect(() => {
          if (!s.open) return undefined;
          const onKey = (event) => { if (event.key === 'Escape') emit({ open: false }); };
          window.addEventListener('keydown', onKey);
          return () => window.removeEventListener('keydown', onKey);
        }, [s.open]);

        // The switch normally lives inside dsh-context's ad slot. The floating
        // fallback button was removed on 2026-11-13 at the user's request: with
        // no slot the control simply stays hidden instead of hovering.
        if (!s.open) {
          // 2026-11-13：按用户要求不再渲染右下角悬浮胶囊。切换卡只出现在
          // dsh-context 广告位槽位（slot === 'mounted'，即打开上下文面板时）；
          // billion 的 Web UI 仍可从面板卡打开，或直接访问代理地址。
          return null;
        }

        return React.createElement('div', {
          'data-dsh-ctx-bili-bridge': 'backdrop',
          onClick: (event) => { if (event.target === event.currentTarget) emit({ open: false }); },
          style: {
            position: 'fixed', top: 0, left: 0, width: vw, height: vh, zIndex: 2147483001,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box',
            background: dark ? 'rgba(0,0,0,.62)' : 'rgba(15,23,42,.38)',
            color: ink, fontFamily: 'inherit', fontSize: 12,
          },
        }, React.createElement('div', {
          'data-dsh-ctx-bili-bridge': 'panel',
          style: {
            width: panelW, height: panelH, flex: '0 0 auto',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            borderRadius: 12, border: `1px solid ${line}`, background: surface,
            boxShadow: '0 24px 72px rgba(0,0,0,.5)',
          },
        },
        React.createElement('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto',
            padding: '8px 12px', borderBottom: `1px solid ${line}`,
          },
        },
        React.createElement('span', { style: { fontWeight: 600 } }, cfg.switchLabel),
        React.createElement('span', { style: { opacity: .6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, source),
        React.createElement('button', {
          type: 'button', style: { ...btn, marginLeft: 'auto' },
          onClick: () => emit({ open: false }),
        }, '关闭')),
        React.createElement('iframe', {
          key: s.sessionId || 'all',
          src: url, title: cfg.switchLabel,
          allow: 'clipboard-write',
          style: { flex: 1, width: '100%', border: 'none', background: surface },
        })));
      };
    }

    function ensurePatchStyle() {
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc || doc.getElementById(PATCH_STYLE_ID)) return;
      const style = doc.createElement('style');
      style.id = PATCH_STYLE_ID;
      style.textContent = UI_PATCH_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }

    /**
     * UI-1 (下放): claude-style's `aside.dsh-claude-details` must not sit on the
     * main area by default — the pane belongs to the sidebar, opened on demand.
     *
     * Two moves, once per page load:
     *   1. persist `sessionPanelClosed=1` so the next load starts closed;
     *   2. click the toggle if it is currently open, so this load closes too.
     * One-shot: the reader can still open it any time, and we never fight them.
     */
    function collapseSessionPanelOnce() {
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc) return () => {};
      const KEY = 'dsh-claude-style.sessionPanelClosed';
      try {
        if (window.localStorage?.getItem(KEY) !== '1') window.localStorage?.setItem(KEY, '1');
      } catch { /* private mode / quota */ }
      let done = false;
      const timer = setInterval(() => {
        if (done || !doc.body) return;
        const open = doc.body.hasAttribute('data-dsh-claude-session-panel');
        const btn = doc.querySelector('.dsh-claude-session-panel-button');
        if (!open && btn) {
          done = true;
          clearInterval(timer);
          return;
        }
        if (open && btn) {
          btn.click();
          done = true;
          clearInterval(timer);
        }
      }, 1200);
      return () => clearInterval(timer);
    }

    /**
     * UI-8 (下放): claude-style's `viewTabs` feature takes DSH's native
     * view-tab DOM over in two ways:
     *
     *   - POSITION — it marks the tab strip `data-dsh-view-tabs`, marks
     *     <header> `data-dsh-titlebar-tabs` / `data-dsh-view-tabs-taken`
     *     / `data-dsh-claude-holds~=view-tabs`, and writes inline
     *     `--dsh-view-tabs-shift*` vars, so its stylesheet pins the strip
     *     into the Windows title bar with `position:fixed`.
     *   - STYLE — it skins the inner native `[data-conversation-tabs]`
     *     tablist with the class `dsh-claude-view-switch` plus
     *     `data-dsh-claude-pill` / `data-dsh-claude-part` markers, which turns
     *     the tabs into a centred pill switch, paints the active tab dark and
     *     kills its underline.
     *
     * Undo the takeover completely: strip every claude-style marker back off
     * the tab DOM. DSH's own rules then apply untouched — the strip sits
     * under the title and is left-aligned, the active tab keeps its business
     * colour and its 2px underline, and every tab (对话 / 轨迹 / 上下文 /
     * 编队 / 统计 / …) is still there. Nothing is rebuilt, restyled or hidden
     * by us; we only undo the takeover.
     *
     * claude-style re-asserts its markers whenever it re-runs the feature
     * (resize, focus, re-render), so a MutationObserver keeps stripping them
     * for the life of the page. The CSS backstops in UI_PATCH_CSS keep the
     * strip in place and the underline visible during the short window
     * between claude-style writing a marker and the observer clearing it.
     */
    function parkViewTabs() {
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc) return () => {};
      const SHIFT_VARS = [
        '--dsh-view-tabs-shift', '--dsh-view-tabs-shift-x',
        '--dsh-header-band-tabs-left', '--dsh-view-tabs-title-cap',
      ];
      const PILL_VARS = [
        '--dsh-claude-pill-x', '--dsh-claude-pill-y',
        '--dsh-claude-pill-w', '--dsh-claude-pill-h',
      ];
      // The strip is the tablist's parent; both carry takeover markers.
      const stripOf = (list) => {
        const parent = list?.parentElement;
        if (!parent) return null;
        if (parent.hasAttribute('data-dsh-view-tabs')) return parent;
        if (parent.getAttribute('data-dsh-claude-part') === 'view-tabs') return parent;
        return null;
      };
      const clean = () => {
        let touched = false;
        // (a) header markers that key claude-style's pin / band rules
        for (const hdr of doc.querySelectorAll('[data-dsh-titlebar-tabs],[data-dsh-view-tabs-taken]')) {
          hdr.removeAttribute('data-dsh-titlebar-tabs');
          hdr.removeAttribute('data-dsh-view-tabs-taken');
          touched = true;
        }
        for (const hdr of doc.querySelectorAll('[data-dsh-claude-holds]')) {
          const holds = (hdr.getAttribute('data-dsh-claude-holds') || '').split(/\s+/).filter(Boolean);
          if (!holds.includes('view-tabs')) continue;
          const rest = holds.filter((h) => h !== 'view-tabs');
          if (rest.length) hdr.setAttribute('data-dsh-claude-holds', rest.join(' '));
          else hdr.removeAttribute('data-dsh-claude-holds');
          touched = true;
        }
        // (b) the inner native tablist and (c) the strip around it
        for (const list of doc.querySelectorAll('[data-conversation-tabs]')) {
          if (list.classList?.contains('dsh-claude-view-switch')) {
            list.classList.remove('dsh-claude-view-switch');
            touched = true;
          }
          for (const attr of ['data-dsh-claude-pill', 'data-dsh-claude-part']) {
            if (list.hasAttribute?.(attr)) { list.removeAttribute(attr); touched = true; }
          }
          for (const v of PILL_VARS) {
            if (list.style?.getPropertyValue(v)) { list.style.removeProperty(v); touched = true; }
          }
          for (const btn of list.querySelectorAll('button[data-dsh-claude-part]')) {
            btn.removeAttribute('data-dsh-claude-part');
            touched = true;
          }
          const strip = stripOf(list);
          if (!strip) continue;
          for (const attr of ['data-dsh-view-tabs', 'data-dsh-claude-part']) {
            if (strip.hasAttribute(attr)) { strip.removeAttribute(attr); touched = true; }
          }
          for (const v of SHIFT_VARS) {
            if (strip.style?.getPropertyValue(v)) { strip.style.removeProperty(v); touched = true; }
          }
        }
        if (touched) doc.documentElement.setAttribute('data-dsh-ui-viewtabs-parked', '');
        return touched;
      };
      clean();
      let observer = null;
      try {
        observer = new MutationObserver(() => {
          // Cheap gate: only do the work when a takeover marker is present.
          if (doc.querySelector(
            '[data-dsh-view-tabs],[data-dsh-titlebar-tabs],[data-dsh-view-tabs-taken],'
            + '.dsh-claude-view-switch,[data-dsh-claude-pill]',
          )) clean();
        });
        observer.observe(doc.documentElement, {
          attributes: true, subtree: true,
          attributeFilter: [
            'data-dsh-view-tabs', 'data-dsh-titlebar-tabs', 'data-dsh-view-tabs-taken',
            'data-dsh-claude-holds', 'data-dsh-claude-part', 'data-dsh-claude-pill',
            'class', 'style',
          ],
        });
      } catch { /* MutationObserver unavailable — CSS backstop still applies */ }
      return () => observer?.disconnect();
    }

    function apply(ctx) {
      const cfg = readConfig();
      ensurePatchStyle();
      try {
        ctx.effect(() => collapseSessionPanelOnce(), 'dsh-ui-adapter: session panel collapsed');
      } catch { collapseSessionPanelOnce(); }
      try {
        ctx.effect(() => parkViewTabs(), 'dsh-ui-adapter: view tabs parked');
      } catch { parkViewTabs(); }
      let stopped = false;
      let timer;
      let statusTimer;
      let originResolved = null;
      bindSessions(ctx);

      // The iframe needs a real origin; the data path does not, because it goes
      // through our own same-origin route.
      const resolvePanelOrigin = async () => {
        if (originResolved) return originResolved;
        try {
          const res = await fetch(STATUS_ROUTE, { cache: 'no-store' });
          if (res.ok) {
            const info = await res.json();
            if (typeof info?.origin === 'string' && info.origin) {
              originResolved = info.origin.replace(/\/+$/, '');
              emit({ origin: originResolved });
              return originResolved;
            }
          }
        } catch { /* fall through to discovery */ }
        originResolved = await discoverOrigin(cfg);
        emit({ origin: originResolved });
        return originResolved;
      };

      const readSessions = async (url) => {
        const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
        if (!res.ok) {
          // 404 here means the host half has not registered the route yet — the
          // page was reloaded but the DSH process still runs the old build.
          if (res.status === 404) throw new Error('同源路由未注册，需重启 DSH 进程');
          const body = await res.json().catch(() => null);
          const detail = body?.error?.message || body?.error?.type;
          throw new Error(detail ? `${detail} (HTTP ${res.status})` : `HTTP ${res.status}`);
        }
        return res.json();
      };

    /**
     * Renderer-side diagnostics. The client half cannot write files, so it
     * POSTs its view (which sessions-acquisition path worked, which session id
     * it resolved, what the shim write returned) to the host, which appends it
     * to .host.log. Throttled; never allowed to break the poll.
     */
    let diagLastAt = 0;
    async function reportDiag(ctx, extra) {
      try {
        const now = Date.now();
        if (now - diagLastAt < 30000) return;
        diagLastAt = now;
        const svc = sessionsOf(ctx);
        const body = JSON.stringify({
          via: sessionsBox.via,
          sessions: svc ? 'ok' : 'missing',
          id: conversationIdOf(ctx) || null,
          shim: state.shim,
          ...extra,
        });
        await fetch(DIAG_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          cache: 'no-store',
        });
      } catch { /* diagnostics are best-effort only */ }
    }

      const poll = async () => {
        if (stopped) return;
        void resolvePanelOrigin();
        try {
          // Same-origin host proxy: billion sends no CORS header, so a direct
          // cross-origin call from this page is always blocked.
          let payload;
          try {
            payload = await readSessions(SESSIONS_ROUTE);
          } catch (err) {
            // Desktop builds load the page over `dsh-app://`; if that protocol
            // does not forward arbitrary paths, fall back to billion's own
            // relay (`/__bili`, active only when security.adminRelay is on).
            if (!String(err?.message ?? '').includes('同源路由未注册')) throw err;
            payload = await readSessions('/__bili/sessions');
          }
          const list = Array.isArray(payload) ? payload : Array.isArray(payload?.sessions) ? payload.sessions : [];
          const { session, match } = pickSessionDetailed(payload, conversationIdOf(ctx));
          const usage = toUsage(session);
          // Same-turn shim write: apply() beats the host's native tokenUsage
          // row at seqOf+1, so the statistics card follows the billion ledger.
          const shim = cfg.patchUsage ? writeUsageProjection(ctx, usage) : 'off';
          emit({
            usage,
            sessionId: typeof session?.id === 'string' ? session.id : null,
            model: typeof session?.model === 'string' ? session.model : null,
            sessionCount: list.length,
            match,
            connection: 'ok',
            shim,
            error: null,
            lastPoll: Date.now(),
          });
          void reportDiag(ctx, { match, sessionCount: list.length, usage: Boolean(usage) });
        } catch (err) {
          emit({
            connection: 'fail', match: 'none', usage: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      };

      const slot = createSlot(cfg);

      try {
        ctx.effect(() => {
          void poll();
          timer = setInterval(() => void poll(), cfg.pollMs);
          // The proxy can restart on a different port; refresh the panel origin
          // occasionally so the iframe does not keep pointing at a dead one.
          statusTimer = setInterval(() => { originResolved = null; void resolvePanelOrigin(); }, 30000);
          slot.start();
          return () => {
            stopped = true;
            if (timer) clearInterval(timer);
            if (statusTimer) clearInterval(statusTimer);
            slot.stop();
          };
        }, 'dsh-ui-adapter: ledger poll');
      } catch {
        void poll();
        timer = setInterval(() => void poll(), cfg.pollMs);
        slot.start();
      }

      // The usage shim writes from the poll loop (writeUsageProjection above);
      // nothing to install eagerly here.

      // Only shell.overlay is registered. Registering a second conversation.view
      // entry would add a third tab, which is exactly what this bridge removes.
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay', id: 'dsh-ui-adapter', order: 90,
      }, buildOverlay(ctx, slot)));
    }

    module.exports = { apply, inject };
    return module.exports;
  },
});
// dsh-session-panel — client half (原生 DSH web module)
// 右侧会话详情栏：环境 / 上下文 / 会话统计 / Token 用量 / 子智能体。
// 不依赖 dsh-claude-style；只依赖原生 DSH 提供的 react 与 slots，数据来自同源路由 /__dsh-session-panel。
// Copyright (C) 2026 Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
// 文案与分项算法移植自 dsh-claude-style (MIT, (c) 2026 Nwflower)。

window.__ModuleLoader__.load({
  id: '@local/dsh-session-panel',
  factory: (require) => {
    'use strict';
    const module = { exports: {} };
    const React = require('react');
    const h = React.createElement;
    // 顶层只声明 slots；sidebarRightTabs 由 sidebar-right 插件在 apply 阶段
    // provide，加载时序更晚，因此在 apply 内用 ctx.inject 动态等待（与 dsh-context 一致）。
    const inject = ['slots'];

    const ROUTE = '/__dsh-session-panel';
    const POLL_MS = 2500;
    const STYLE_ID = 'dsh-session-panel-style';
    // 头部常驻开关已就位的标记；只有它存在，CSS 才隐藏原生那两个按钮。
    const TOGGLE_FLAG = 'data-dsp-header-toggle';

    const COPY = {
      environment: '环境', thisComputer: '本机', context: '上下文',
      contextUsedPct: p => `已用 ${p}%`, contextFree: '剩余空间',
      sessionStats: '会话统计', tokenUsage: 'Token 用量', subagents: '子智能体',
      systemTokens: '系统提示', capabilityTokens: '工具、技能和MCP',
      conversationTokens: '对话正文', reasoningTokens: '推理过程',
      toolCallTokens: '执行过程', toolResultTokens: '工具结果',
      attachmentTokens: '文件与图片', injectionTokens: '上下文注入',
      statsTurns: '回合', statsSteps: '步骤', statsOutputSpeed: '输出速度',
      statsFirstToken: '首 token 平均', statsModelTime: '模型用时', statsToolTime: '工具调用用时',
      statsUncachedInput: '未缓存输入', statsCacheRead: '缓存读取', statsCacheWrite: '缓存写入',
      statsOutput: '输出', statsCost: '费用', statsCacheHit: '缓存命中',
      detailsToggle: '会话详情', sectionTurns: n => `${n} 回合`,
      unavailable: '会话总览暂不可用', noContext: '还没有上下文读数',
      running: '运行中', done: '已结束',
    };

    // 样式：面板内容渲染在 DSH 原生右侧栏里，颜色全部跟随 DSH 主题变量。
    const CSS = [
      '.dsp-sidebar{box-sizing:border-box;height:100%;overflow-y:auto;',
      'padding:14px 16px 40px;font:inherit;font-size:13px;',
      'color:var(--dsw-alias-label-primary,#1f2329);',
      'background:var(--dsw-alias-bg-layer-1,#ffffff)}',
      '.dsp-tab-title{font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#1f2329)}',
      '.dsp-sec{margin-bottom:18px}',
      '.dsp-sec-h{display:flex;align-items:center;justify-content:space-between;',
      'font-weight:600;font-size:13px;margin:0 0 8px;padding-bottom:6px;',
      'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12))}',
      '.dsp-sec-summary{font-weight:400;font-size:12px;color:var(--dsw-alias-label-secondary,#646a73)}',
      '.dsp-row{display:flex;align-items:baseline;gap:8px;padding:4px 0;min-height:22px}',
      '.dsp-mark{width:14px;flex:0 0 14px;color:var(--dsw-alias-label-secondary,#646a73);text-align:center}',
      '.dsp-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsp-detail{color:var(--dsw-alias-label-secondary,#646a73);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}',
      '.dsp-hint{color:var(--dsw-alias-label-caption,#8f959e);font-size:11px}',
      '.dsp-ctx-head{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}',
      '.dsp-ctx-fig{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#646a73)}',
      '.dsp-bar{display:flex;height:7px;border-radius:4px;overflow:hidden;background:var(--dsw-alias-bg-layer-3,#e8eaed)}',
      '.dsp-seg{height:100%}',
      '.dsp-legend{margin:10px 0 0;display:grid;gap:5px;font-size:12px}',
      '.dsp-legend-row{display:grid;grid-template-columns:1fr auto 44px;gap:6px;align-items:center}',
      '.dsp-legend-row dt{display:flex;align-items:center;gap:7px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsp-legend-row dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}',
      '.dsp-legend-row .dsp-share{color:var(--dsw-alias-label-caption,#8f959e);font-size:11px}',
      '.dsp-dot{width:8px;height:8px;border-radius:2px;display:inline-block;flex:0 0 8px}',
      '.dsp-stats{margin:0;display:grid;gap:4px;font-size:12px}',
      '.dsp-stat{display:flex;justify-content:space-between;gap:10px;padding:2px 0}',
      '.dsp-stat dd{margin:0;font-variant-numeric:tabular-nums}',
      '.dsp-note{color:var(--dsw-alias-label-secondary,#646a73);font-size:12px;margin:0}',
      '.is-free{color:var(--dsw-alias-label-caption,#8f959e)}',
      // 头部常驻开关：见 HeaderToggle 的注释。外观对齐同排的 28px 紧凑按钮。
      '.dsp-header-toggle{flex:none;display:inline-flex;align-items:center;justify-content:center;',
      'box-sizing:border-box;width:28px;height:28px;padding:0;border:none;border-radius:6px;',
      'background:transparent;color:var(--dsw-alias-label-secondary,#646a73);cursor:pointer}',
      '.dsp-header-toggle:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));',
      'color:var(--dsw-alias-label-primary,#1f2329)}',
      '.dsp-header-toggle svg{width:15px;height:15px}',
      // 原生展开按钮坐在 headerCorner（「…」右侧）。它在我们展开时按原生规则不渲染，
      // 收起时又出现，于是开关在「…」左右来回跳。开关由本插件的常驻按钮接管后，
      // 这里把它拿掉，「…」因此恒为该行最右。
      // 规则挂在 body[data-dsp-header-toggle] 上，只有常驻按钮真的注册成功才置位：
      // 注册失败时原生按钮照旧可用，用户不会失去唯一入口。
      `body[${TOGGLE_FLAG}] [data-sidebar-right-expand]{display:none!important}`,
      // 同理收掉 claude-style 那个「收起右侧栏」按钮（它注入在同一行的 utilities，
      // 落在「…」左侧），避免同一行出现两个开关。
      `body[${TOGGLE_FLAG}] .dsh-claude-rightbar-close{display:none!important}`,
    ].join('\n');

    function injectStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // 分项颜色：与 DSH 深色主题协调的一套稳定配色。
    const COLORS = {
      system: '#8b8b95', capability: '#6f9bd8', conversation: '#6fbf9b',
      reasoning: '#b58ad6', 'tool-call': '#d2a15e', 'tool-result': '#d47a7a',
      attachment: '#7fb7c4', injection: '#a0a0ad', free: 'rgba(127,127,127,.35)',
    };

    function compact(n) {
      const v = Number(n) || 0;
      const whole = Math.round(v);
      if (whole < 1e3) return String(whole);
      const units = ['', 'k', 'M', 'B', 'T'];
      let u = 0, x = v;
      while (x >= 1000 && u < 4) { x /= 1000; u++; }
      return (Math.round(x * 10) / 10) + units[u];
    }
    function percent(value, whole) {
      if (!(whole > 0)) return '0';
      const p = Math.max(0, Math.min(100, value / whole * 100));
      if (p >= 99.95) return '100';
      return p >= 10 ? String(Math.round(p)) : String(Math.round(p * 10) / 10);
    }
    function baseName(path) {
      const n = String(path || '').replaceAll('\\', '/').replace(/\/+$/, '');
      const i = n.lastIndexOf('/');
      return i === -1 ? n : n.slice(i + 1);
    }
    function shortPath(path, home) {
      const n = String(path || '').replaceAll('\\', '/').replace(/\/+$/, '');
      const b = String(home || '').replaceAll('\\', '/').replace(/\/+$/, '');
      if (!b) return n;
      if (n === b) return '~';
      if (n.startsWith(b + '/')) return '~' + n.slice(b.length);
      return n;
    }
    function duration(ms) {
      const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60), r = s % 60;
      if (m < 60) return m + ':' + String(r).padStart(2, '0');
      return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    }

    // 上下文分项：tools/mcp/skills 合并为“工具、技能和MCP”一行，按占比分配已用 token。
    const DISPLAY_ORDER = ['system', 'capability', 'conversation', 'reasoning', 'tool-call', 'tool-result', 'attachment', 'injection'];
    const LABELS = {
      system: COPY.systemTokens, capability: COPY.capabilityTokens, conversation: COPY.conversationTokens,
      reasoning: COPY.reasoningTokens, 'tool-call': COPY.toolCallTokens, 'tool-result': COPY.toolResultTokens,
      attachment: COPY.attachmentTokens, injection: COPY.injectionTokens,
    };
    // 已用 token 取哪个口径。
    //
    // 宿主 `contextPressure` 的 `pressureTokens` 是供应商结算口径：只有 assistant
    // 成功结算才落值。请求被取消 / 全部重试失败时它报 0，而分项（由事件折出）
    // 依然是真实的——那时用它当基数，`used * weight / total` 会把每一行都乘成 0。
    // 所以供应商值 > 0 时以它为准；否则回退到分项合计，也就是下一轮请求实际
    // 会发送的表面大小。回退时 `estimated` 为 true，调用方加 `~` 标注，
    // 不把它伪装成供应商精确读数。
    function resolveUsed(context) {
      const parts = Array.isArray(context?.parts) ? context.parts : [];
      const partsTotal = parts.reduce((s, p) => s + (p.tokens || 0), 0);
      const providerUsed = Math.max(0, Math.round(context?.used || 0));
      if (providerUsed > 0) return { used: providerUsed, estimated: false, partsTotal };
      return { used: partsTotal, estimated: partsTotal > 0, partsTotal };
    }

    function contextRows(context, used) {
      const parts = Array.isArray(context?.parts) ? context.parts : [];
      const total = parts.reduce((s, p) => s + (p.tokens || 0), 0);
      const weights = Object.fromEntries(DISPLAY_ORDER.map(k => [k, 0]));
      for (const part of parts) {
        if (part.kind === 'tools' || part.kind === 'mcp' || part.kind === 'skills') weights.capability += part.tokens || 0;
        else if (weights[part.kind] !== undefined) weights[part.kind] += part.tokens || 0;
      }
      const wTotal = DISPLAY_ORDER.reduce((s, k) => s + weights[k], 0);
      const effective = total > 0 ? wTotal : 1;
      let allocated = 0, cumulative = 0;
      const rows = [];
      for (const kind of DISPLAY_ORDER) {
        const weight = total > 0 ? weights[kind] : (kind === 'injection' ? 1 : 0);
        if (weight <= 0) continue;
        cumulative += weight;
        const next = Math.round(used * cumulative / effective);
        const tokens = next - allocated;
        allocated = next;
        rows.push({ kind, label: LABELS[kind], tokens, share: context.window > 0 ? tokens / context.window * 100 : 0 });
      }
      return rows.sort((a, b) => b.tokens - a.tokens);
    }

    function Row({ mark, title, detail, hint }) {
      return h('div', { className: 'dsp-row' },
        mark ? h('span', { className: 'dsp-mark' }, mark) : null,
        h('span', { className: 'dsp-title', title: title }, title),
        detail ? h('span', { className: 'dsp-detail', title: detail }, detail) : null,
        hint ? h('span', { className: 'dsp-hint' }, hint) : null);
    }
    function Section({ title, summary, children }) {
      return h('section', { className: 'dsp-sec' },
        h('div', { className: 'dsp-sec-h' },
          h('span', null, title),
          summary ? h('span', { className: 'dsp-sec-summary' }, summary) : null),
        children);
    }

    function EnvironmentSection({ env }) {
      if (!env) return null;
      const rows = [
        h(Row, { key: 'pc', mark: '▣', title: COPY.thisComputer }),
        h(Row, { key: 'dir', mark: '▤', title: baseName(env.directory), detail: shortPath(env.directory, env.home) }),
      ];
      const co = env.checkout;
      if (co) {
        rows.push(h(Row, { key: 'branch', mark: '⑂', title: co.branch || co.commit || '', detail: co.repository || undefined }));
      }
      return h(Section, { key: 'env', title: COPY.environment, summary: baseName(env.directory) }, rows);
    }

    function ContextSection({ context }) {
      if (!context || !(context.window > 0)) {
        return h(Section, { key: 'ctx', title: COPY.context }, h('p', { className: 'dsp-note' }, COPY.noContext));
      }
      const { used: rawUsed, estimated } = resolveUsed(context);
      const used = Math.max(0, Math.min(context.window, rawUsed));
      const pct = percent(used, context.window);
      const rows = contextRows(context, used);
      const free = Math.max(0, context.window - used);
      // 回退口径时加 `~`：数值来自按事件折算的表面大小，不是供应商结算读数。
      const tilde = estimated ? '~' : '';
      const pctText = tilde + pct;
      return h(Section, { key: 'ctx', title: COPY.context, summary: pctText + '%' },
        h('div', null,
          h('div', { className: 'dsp-ctx-head' },
            h('span', null, COPY.contextUsedPct(pctText)),
            h('span', { className: 'dsp-ctx-fig' }, `${tilde}${compact(used)} / ${compact(context.window)}`)),
          h('div', { className: 'dsp-bar', role: 'img', 'aria-label': COPY.contextUsedPct(pctText) },
            rows.length
              ? rows.map(r => h('span', { key: r.kind, className: 'dsp-seg', style: { width: r.share + '%', background: COLORS[r.kind] } }))
              : h('span', { className: 'dsp-seg', style: { width: (used / context.window * 100) + '%', background: COLORS.system } })),
          h('dl', { className: 'dsp-legend', title: estimated
            ? '分项按发送给模型的内容计价；本轮无供应商结算读数，已用值取分项合计（估算）'
            : '分项按发送给模型的内容计价，并按比例分配至已用上下文' },
            rows.map(r => h('div', { key: r.kind, className: 'dsp-legend-row' },
              h('dt', null, h('i', { className: 'dsp-dot', style: { background: COLORS[r.kind] } }), r.label),
              h('dd', null, compact(r.tokens)),
              h('dd', { className: 'dsp-share' }, r.share.toFixed(1) + '%'))),
            h('div', { className: 'dsp-legend-row is-free' },
              h('dt', null, h('i', { className: 'dsp-dot', style: { background: COLORS.free } }), COPY.contextFree),
              h('dd', null, compact(free)),
              h('dd', { className: 'dsp-share' }, (context.window > 0 ? free / context.window * 100 : 0).toFixed(1) + '%')))));
    }

    function Figures({ rows }) {
      return h('dl', { className: 'dsp-stats' },
        rows.filter(r => r.value !== undefined && r.value !== null).map(r =>
          h('div', { key: r.key, className: 'dsp-stat' }, h('dt', null, r.label), h('dd', null, r.value))));
    }

    function StatsSection({ stats }) {
      if (!stats) return null;
      const rows = [
        { key: 'turns', label: COPY.statsTurns, value: String(stats.turns ?? 0) },
        { key: 'steps', label: COPY.statsSteps, value: String(stats.steps ?? 0) },
      ];
      if (stats.decodeMs > 0) {
        const tps = stats.decodeTokens / (stats.decodeMs / 1000);
        rows.push({ key: 'speed', label: COPY.statsOutputSpeed, value: (Math.round(tps * 10) / 10) + ' tok/s' });
      }
      if (stats.ttftSteps > 0) rows.push({ key: 'ttft', label: COPY.statsFirstToken, value: duration(stats.ttftMs / stats.ttftSteps) });
      rows.push({ key: 'model', label: COPY.statsModelTime, value: duration(stats.llmMs) });
      rows.push({ key: 'tool', label: COPY.statsToolTime, value: duration(stats.toolMs) });
      const speed = rows.find(r => r.key === 'speed')?.value;
      return h(Section, { key: 'stats', title: COPY.sessionStats, summary: speed || COPY.sectionTurns(stats.turns ?? 0) }, h(Figures, { rows }));
    }

    function TokensSection({ stats }) {
      if (!stats) return null;
      const billed = (stats.uncachedInputTokens ?? 0) + (stats.cacheReadTokens ?? 0) + (stats.cacheWriteTokens ?? 0);
      const rows = [];
      if (billed > 0) rows.push({ key: 'cache', label: COPY.statsCacheHit, value: Math.round((stats.cacheReadTokens / billed) * 100) + '%' });
      rows.push({ key: 'uncached', label: COPY.statsUncachedInput, value: compact(stats.uncachedInputTokens) + ' tok' });
      rows.push({ key: 'read', label: COPY.statsCacheRead, value: compact(stats.cacheReadTokens) + ' tok' });
      rows.push({ key: 'write', label: COPY.statsCacheWrite, value: compact(stats.cacheWriteTokens) + ' tok' });
      rows.push({ key: 'out', label: COPY.statsOutput, value: compact(stats.outputTokens) + ' tok' });
      return h(Section, { key: 'tokens', title: COPY.tokenUsage, summary: compact(billed + (stats.outputTokens ?? 0)) + ' tok' }, h(Figures, { rows }));
    }

    function SubagentsSection({ background }) {
      const list = Array.isArray(background?.subagents) ? background.subagents : [];
      if (list.length === 0) return null;
      const running = list.filter(a => a.running).length;
      const rows = list.map((a, i) => h(Row, {
        key: a.id || i, mark: '◆', title: a.label || a.id,
        detail: a.running ? COPY.running : COPY.done,
      }));
      return h(Section, { key: 'sub', title: COPY.subagents, summary: running > 0 ? `${running} 运行中` : `${list.length} 项${COPY.done}` }, rows);
    }

    function Panel({ value }) {
      if (value === null) return h('div', null, h('p', { className: 'dsp-note' }, COPY.unavailable));
      return h('div', null,
        h(EnvironmentSection, { env: value.environment }),
        h(ContextSection, { context: value.context }),
        h(StatsSection, { stats: value.stats }),
        h(TokensSection, { stats: value.stats }),
        h(SubagentsSection, { background: value.background }));
    }

    // 右侧栏正文：框架标准 props 自动带入 sessionId（见 dsh-context 正文组件 r.sessionId）。
    // keyed slot 的 inject 回调第一个参数是 slot key，不是 sessionId，故不再用 inject 传参。
    function SidebarPanel({ sessionId }) {
      const [value, setValue] = React.useState(null);
      const id = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '';

      React.useEffect(() => {
        if (id === '') return undefined;
        diag('panel-mounted', { sessionId: id });
        let timer = null, stopped = false, inFlight = false;
        const tick = async () => {
          if (stopped || document.hidden || inFlight) return;
          inFlight = true;
          try {
            const res = await fetch(`${ROUTE}?id=${encodeURIComponent(id)}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const answer = await res.json();
            if (!stopped && answer?.ok === true) { setValue(answer.value); diag('panel-data', { sessionId: id, ok: true }); }
          } catch (err) { diag('panel-fetch-failed', { sessionId: id, message: String(err && err.message || err) }); }
          finally { inFlight = false; }
        };
        setValue(null);
        tick();
        timer = setInterval(tick, POLL_MS);
        return () => { stopped = true; if (timer) clearInterval(timer); };
      }, [id]);

      return h('div', { className: 'dsp-sidebar' }, h(Panel, { value }));
    }

    // tab 标题：原生右侧栏的标签头。
    function SidebarTabTitle() {
      return h('span', { className: 'dsp-tab-title' }, COPY.detailsToggle);
    }

    // 会话头部常驻开关。
    //
    // 为什么必须由本插件提供，而不是沿用原生那个：
    // 原生 ExpandButton 注册在 conversation.session.header.corner，位置在「…」
    // 右侧；它在桌面端 `expanded === true` 时直接 return null。于是「展开」时
    // 该按钮消失、「收起」时又出现 —— 面板一起一收，开关就在「…」左右跳。
    // 而 headerUtilities 里的内容永远渲染在「…」之前（ConversationSession 先
    // renderSlot('utilities') 再渲染 contextMenu 的「…」按钮），把开关放进
    // utilities，它和「…」的相对顺序就固定了：「…」恒为最右。
    // 原生那个按钮由上面的 CSS 拿掉，避免同一行出现两个开关。
    function HeaderToggle(props) {
      const sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : '';
      const onClick = React.useCallback(() => {
        try {
          // 每次点击现取现用，不依赖模块级引用。
          // sidebarRightRef 会被 disposer 置空，而插件重载时旧 disposer 可能
          // 在新注入之后才执行 —— 那样按钮就永久哑掉了。ctx.get 总拿当前实例。
          const api = (typeof pluginCtx?.get === 'function' ? pluginCtx.get('sidebarRight') : null)
            ?? sidebarRightRef;
          if (!api) {
            diag('header-toggle-no-api', { sessionId });
            return;
          }
          // 分两支，不靠 toggleExpanded 的隐含语义：
          //  - 已展开 → 收起；
          //  - 未展开 → 直接打开本插件的会话详情 tab。
          // 用显式 openTabIn 而不是裸 toggle：后者只翻转 expanded，若该会话的
          // 布局里没有可显示的 tab（guide 已被替换掉、或 tab 被关掉），
          // 展开出来的是一列空白，看起来就是「点了没反应」。
          const expanded = typeof api.isExpanded === 'function' ? api.isExpanded() === true : false;
          if (expanded) {
            api.toggleExpanded();
            diag('header-toggle', { sessionId, action: 'collapse' });
            return;
          }
          // 未展开：先用 openTabIn 打开本插件的 tab（它顺带 planSetExpanded(true)）。
          // 但 openTabIn 在该会话 store 尚未 adopt 时会**静默什么都不做**，
          // 所以动作后必须回读状态确认，没生效再退回原生 toggle。
          if (sessionId !== '' && typeof api.openTabIn === 'function') {
            try { api.openTabIn(sessionId, TAB_KIND); } catch (err) {
              diag('header-toggle-open-tab-failed', { sessionId, message: String(err && err.message || err) });
            }
            const now = typeof api.isExpanded === 'function' ? api.isExpanded() === true : false;
            if (now) {
              diag('header-toggle', { sessionId, action: 'open-tab', kind: TAB_KIND, verified: true });
              return;
            }
            diag('header-toggle', { sessionId, action: 'open-tab-noop', kind: TAB_KIND, verified: false });
          }
          api.toggleExpanded();
          const after = typeof api.isExpanded === 'function' ? api.isExpanded() === true : null;
          diag('header-toggle', { sessionId, action: 'toggle-fallback', verified: after });
        } catch (err) {
          diag('header-toggle-failed', { sessionId, message: String(err && err.message || err) });
        }
      }, [sessionId]);
      return h('button', {
        type: 'button',
        className: 'dsp-header-toggle',
        'aria-label': COPY.detailsToggle,
        title: COPY.detailsToggle,
        'data-dsp-header-toggle': '',
        onClick,
      }, h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'aria-hidden': 'true' },
        // 左栏面板图标的镜像：分隔线落在右侧，表示这是"右侧"那一栏。
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { d: 'M15 4v16' })));
    }

    // 原生导航控制器：HeaderToggle 靠它开合右侧栏。sidebar-right 在更晚的
    // apply 阶段 provide，所以用 ctx.inject 等到就绪再落库。
    // 同时留一份 pluginCtx，供点击时 ctx.get 现取（见 HeaderToggle 的注释）。
    let sidebarRightRef = null;
    let pluginCtx = null;

    // 状态层自证（不依赖 DOM/UI、不点任何按钮）：
    // 读取 sidebar-right 自己写入的持久化布局（localStorage，键 dsh.sidebar-right.v1.<sessionId>），
    // 按其 schema 解析出每个会话的 tab 列表与激活 tab，据此断言：
    //   1) 「会话详情」tab 存在于该会话的布局中；
    //   2) 它是当前激活的 tab（即右侧栏默认呈现的就是会话详情）；
    //   3) 原生 guide（kind='guide'）tab 已不在该会话布局里（已被替换）。
    function probeState() {
      try {
        if (typeof localStorage === 'undefined') return;
        const sessions = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith('dsh.sidebar-right.v1.')) continue;
          const sessionId = key.slice('dsh.sidebar-right.v1.'.length);
          let envelope = null;
          try { envelope = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
          const surface = envelope?.bySession?.[sessionId];
          const layout = surface?.layout;
          if (!layout || !layout.tabs) continue;
          const tabs = Object.values(layout.tabs).map((t) => ({
            tabId: t.id, kind: t.kind, title: t.title, contentId: t.contentId,
          }));
          // 激活态来自 pane 的 activeTabId。
          const activeTabIds = new Set();
          for (const node of Object.values(layout.nodes || {})) {
            if (node?.kind === 'pane' && node.activeTabId) activeTabIds.add(node.activeTabId);
          }
          const details = tabs.find((t) => t.kind === TAB_KIND);
          const guide = tabs.find((t) => t.kind === 'guide');
          sessions.push({
            sessionId,
            expanded: layout.expanded === true,
            tabCount: tabs.length,
            kinds: tabs.map((t) => t.kind),
            detailsPresent: !!details,
            detailsActive: !!(details && activeTabIds.has(details.tabId)),
            guidePresent: !!guide,
            tabs,
          });
        }
        // 同一次采样里记录原生右侧栏相关节点的在场情况：
        // 展开按钮只在面板收起时渲染（桌面端），所以「状态已展开但按钮不在」
        // 与「状态已展开但面板没渲染」是两种不同的故障，必须分开看。
        const dom = {
          panelEl: !!document.querySelector('[data-sidebar-right-panel]'),
          expandBtn: !!document.querySelector('[data-sidebar-right-expand]'),
          collapseBtn: !!document.querySelector('[data-sidebar-right-toggle]'),
          openFlag: !!document.querySelector('[data-sidebar-right-open]'),
          ourBody: !!document.querySelector('.dsp-sidebar'),
          ourTitle: !!document.querySelector('.dsp-tab-title'),
          vw: document.documentElement.clientWidth,
        };
        // 标题栏/头部角落的按钮清单：定位「按钮消失」必须知道
        // 当前这一排里到底有哪些按钮、各自 aria 与位置。
        const slot = document.querySelector('[data-slot="conversation.session.header.corner"]');
        const corner = [];
        if (slot) {
          for (const b of slot.querySelectorAll('button')) {
            const cs = getComputedStyle(b);
            const r = b.getBoundingClientRect();
            corner.push({
              aria: b.getAttribute('aria-label'),
              cls: (b.getAttribute('class') || '').slice(0, 60),
              dsrExpand: b.hasAttribute('data-sidebar-right-expand'),
              dsrToggle: b.hasAttribute('data-sidebar-right-toggle'),
              display: cs.display, visibility: cs.visibility,
              x: Math.round(r.left), y: Math.round(r.top),
              w: Math.round(r.width), h: Math.round(r.height),
            });
          }
        }
        // 框架三列：第三列就是原生右栏。宽度为 0 意味着面板即使渲染也看不见。
        const frame = document.querySelector('[data-dsh-claude-part="layout-frame"]')
          || document.querySelector('[data-rightbar-col]')?.parentElement;
        const frameCols = frame ? getComputedStyle(frame).gridTemplateColumns : null;
        const col = document.querySelector('[data-rightbar-col]');
        dom.cornerSlot = !!slot;
        dom.cornerButtons = corner;
        // 头部工具行（含「…」）的按钮顺序断言。
        // 要求：本插件的常驻开关存在，且它在「…」左侧；原生展开按钮
        // 与 claude-style 收起按钮都已隐藏。「…」是否为最右由 x 坐标证明，
        // 不依赖任何截图或视觉判断。
        {
          // utilities slot 的宿主；它的父元素就是 headerUtilities 那一行，
          // 「…」作为兄弟节点渲染在 slot 之后，所以本行最后一个按钮就是「…」。
          const utilitiesHost = document.querySelector('[data-slot="conversation.session.header.utilities"]');
          const row = utilitiesHost?.parentElement || null;
          const buttons = row ? Array.from(row.querySelectorAll('button')) : [];
          const pick = (el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
              aria: el.getAttribute('aria-label'),
              tag: el.hasAttribute('data-dsp-header-toggle') ? 'our-toggle'
                : el.hasAttribute('data-sidebar-right-expand') ? 'native-expand'
                  : (el.getAttribute('class') || '').includes('dsh-claude-rightbar-close') ? 'claude-close'
                    : 'other',
              display: cs.display,
              visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
              x: Math.round(r.left),
            };
          };
          const visible = buttons.map(pick).filter((b) => b.visible);
          const ours = visible.find((b) => b.tag === 'our-toggle') || null;
          const more = visible.length ? visible[visible.length - 1] : null;
          dom.headerRow = {
            total: buttons.length,
            visibleCount: visible.length,
            oursX: ours ? ours.x : null,
            moreX: more ? more.x : null,
            // 断言：我方开关在，且严格在最后一个可见按钮（「…」）左边。
            oursLeftOfMore: ours !== null && more !== null && ours.x < more.x,
            // 断言：两个会跳动的原生/claude 按钮都不在可见集合里。
            nativeExpandHidden: !visible.some((b) => b.tag === 'native-expand'),
            claudeCloseHidden: !visible.some((b) => b.tag === 'claude-close'),
            order: visible.map((b) => b.tag),
          };
        }
        dom.frameCols = frameCols;
        dom.rightbarColWidth = col ? Math.round(col.getBoundingClientRect().width) : null;
        dom.bodyRightbarCollapsed = document.body?.hasAttribute?.('data-rightbar-collapsed') === true;
        // 原生右栏列的结构：列在但里面空，说明「面板没渲染」而非「列没开」。
        if (col) {
          const walk = (el, depth) => {
            if (!el || depth > 4) return null;
            return {
              tag: el.tagName,
              slot: el.getAttribute?.('data-slot') ?? undefined,
              side: el.getAttribute?.('data-side') ?? undefined,
              panel: el.getAttribute?.('data-sidebar-right-panel') ?? undefined,
              open: el.getAttribute?.('data-sidebar-right-open') ?? undefined,
              display: getComputedStyle(el).display,
              children: Array.from(el.children || []).slice(0, 6).map((c) => walk(c, depth + 1)),
            };
          };
          dom.rightbarTree = walk(col, 0);
        }
        // 会话头部角落 slot 的宿主：原生展开按钮的座位。
        dom.cornerHostTree = slot ? {
          tag: slot.tagName,
          display: getComputedStyle(slot).display,
          childCount: slot.children.length,
          childTags: Array.from(slot.children || []).map((c) => c.tagName + '.' + ((c.getAttribute('class') || '').split(/\s+/)[0] || '')),
        } : null;
        // 窗口身份：确认诊断采样的是不是用户眼前那个窗口。
        // DSH 桌面端同时存在可见窗口与隐藏渲染器，二者同源共用 localStorage。
        // visibilityState/viewport 是区分它们的唯一程序化依据：
        // 可见窗口 visibilityState='visible'，离屏渲染器为 'hidden'。
        dom.win = {
          title: document.title,
          visibility: document.visibilityState,
          inner: window.innerWidth,
          innerHeight: window.innerHeight,
          outer: window.outerWidth,
          outerHeight: window.outerHeight,
          screenX: window.screenX,
          screenY: window.screenY,
          screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
          dpr: window.devicePixelRatio,
          hidden: document.hidden,
          focus: document.hasFocus(),
          isTop: window.top === window,
          topInner: (() => { try { return window.top?.innerWidth ?? null; } catch { return 'blocked'; } })(),
          frames: document.querySelectorAll('iframe').length,
        };
        const signature = JSON.stringify([sessions, dom]);
        // 每 4 次至少上报一次，跨窗口去重会掩盖「另一个窗口」的存在。
        stateReportCounter = (stateReportCounter + 1) % 4;
        if (signature !== lastStateSignature || stateReportCounter === 0) {
          lastStateSignature = signature;
          const mine = sessions.filter((s) => s.detailsPresent);
          diag('state-probe', {
            sessionCount: sessions.length,
            withDetails: mine.length,
            detailsActiveCount: mine.filter((s) => s.detailsActive).length,
            guideReplacedCount: mine.filter((s) => !s.guidePresent).length,
            dom,
            sessions,
          });
        }
      } catch (err) {
        diag('state-probe-failed', { message: String(err && err.message || err) });
      }
    }
    let lastStateSignature = '';
    let stateReportCounter = 0;

    // guide 入口图标（ComponentType<IconProps>）：一个简洁的会话详情符号。
    function GuideIcon(props) {
      const size = props?.size ?? 20;
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'aria-hidden': 'true' },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { d: 'M7 9h10M7 13h7M7 17h4' }));
    }

    // 两阶段注册（DSH 官方 sidebar-right 机制，见 dsh-context 的 fg()）：
    //   阶段一：ctx.sidebarRightTabs.register(tab 类型定义) —— guide 数组决定“开始”页的入口卡片；
    //   阶段二：slots.inject('sidebar.right.pane.tab'|'...title') 按定义 id 提供正文与标题。
    // 缺了阶段一，slot 里就没有任何 kind 与之对应，入口和正文都不会出现。
    const TAB_ID = '@local/dsh-session-panel';
    const TAB_KIND = 'dsh-session-details';

    // 头部开关的注册：与 tab 类型同一批生命周期。
    // utilities slot 是 list kind（原生与 claude-style 都往这里加按钮），
    // 用 slots.register({name}) 追加一条即可，不需要 key。
    function registerHeaderToggle(ctx) {
      if (typeof ctx?.slots?.inject !== 'function' || typeof ctx.slots.register !== 'function') return undefined;
      try {
        const dispose = ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          // id 必填（同名 slot 靠它区分条目）；order 取高位，让开关排在
          // utilities 内最后一位，紧邻「…」——视觉上就是「开关 + …」固定在右端。
          id: 'dsh-session-panel-toggle',
          order: 100,
        }, HeaderToggle));
        // 置位 body 标记：CSS 里「藏掉原生展开按钮 / claude-style 收起按钮」的
        // 规则只在此刻才生效。注册失败时标记不置位，原生入口照旧可用。
        try { document.body?.setAttribute(TOGGLE_FLAG, ''); } catch {}
        diag('header-toggle-registered');
        return {
          dispose: () => {
            try { document.body?.removeAttribute(TOGGLE_FLAG); } catch {}
            try { dispose?.dispose?.(); } catch {}
          },
        };
      } catch (err) {
        diag('header-toggle-register-failed', { message: String(err && err.message || err) });
        return undefined;
      }
    }

    // 运行时自证：把注册过程的关键事实写进 localStorage。
    // 桌面端与 Web 端共用同一份渲染进程存储，可在不截图、不开浏览器的情况下直接核对真实运行时状态。
    const DIAG_KEY = 'dsh-session-panel:diag';
    const DIAG_ENDPOINT = '/__dsh-session-panel/diag';
    function diag(stage, extra) {
      const event = { t: Date.now(), stage, ...(extra || {}) };
      try {
        if (typeof localStorage !== 'undefined') {
          let prev = { events: [] };
          try { prev = JSON.parse(localStorage.getItem(DIAG_KEY) || 'null') || prev; } catch {}
          const events = Array.isArray(prev.events) ? prev.events : [];
          events.push(event);
          localStorage.setItem(DIAG_KEY, JSON.stringify({ stage, at: Date.now(), events }));
        }
      } catch {}
      // 同时上报宿主侧，落盘成可随时核对的日志。
      try {
        fetch(DIAG_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ events: [event] }),
        }).catch(() => {});
      } catch {}
    }

    function registerTabType(ctx) {
      const disposers = [];
      const push = (fn) => { if (typeof fn === 'function') disposers.push(fn); };
      const tabs = ctx.sidebarRightTabs;
      if (!tabs || typeof tabs.register !== 'function') {
        diag('no-registry', { hasSlots: !!ctx.slots, hasInject: typeof ctx.inject === 'function' });
        return undefined;
      }
      // HMR 重载会重新 apply 本插件，而上一次注册仍占着 tab id（注册表对 id 唯一）。
      // 用全局句柄把上一次的注册先释放掉，保证重复 apply 幂等。
      const globalKey = '__DSH_SESSION_PANEL_REGISTRATION__';
      try {
        const previous = globalThis[globalKey];
        if (typeof previous === 'function') {
          previous();
          diag('released-previous');
        }
      } catch {}
      try {
        // 阶段一：注册 tab 类型 + guide 入口。
        push(tabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          title: () => COPY.detailsToggle,
          guide: [{
            id: TAB_ID,
            order: 90,
            title: () => COPY.detailsToggle,
            description: () => '查看环境、上下文、统计与 Token 用量',
            icon: GuideIcon,
          }],
        }));
        // 阶段二：正文（key = 定义 id；sessionId 由框架标准 props 自动注入）。
        push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
        }, SidebarPanel)));
        // 阶段二：标题 chip。
        push(ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
        }, SidebarTabTitle)));
      } catch (err) {
        // 重复注册 / 接线错误时回滚已完成的注册，避免卡住启动。
        for (const d of disposers) { try { d(); } catch {} }
        if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-session-panel] register failed', err);
        diag('register-failed', { error: String(err && err.message || err) });
        return undefined;
      }
      diag('registered', { tabId: TAB_ID, kind: TAB_KIND, disposers: disposers.length });
      // 周期性状态层探针：读 sidebar-right 自己的持久化布局存储，
      // 断言「会话详情」tab 已被打开且处于激活位。不触碰 DOM。
      try {
        probeState();
        const timer = setInterval(probeState, 2000);
        disposers.push(() => { try { clearInterval(timer); } catch {} });
      } catch {}
      // 直接读取注册表，确认 guide 入口已被采纳（这正是"开始"页卡片的数据来源）。
      try {
        const registry = ctx.sidebarRightTabs;
        const list = registry.guide?.() ?? [];
        const mine = list.filter((e) => e.kind === TAB_KIND || e.providerId === TAB_ID);
        diag('guide-entries', {
          total: list.length,
          mineCount: mine.length,
          mine: mine.map((e) => ({ kind: e.kind, providerId: e.providerId, id: e.id, title: e.title?.() })),
          // get(kind) 存在即代表该 kind 可被 openTab 打开。
          kindResolvable: !!registry.get?.(TAB_KIND),
        });
      } catch (err) {
        diag('guide-entries-failed', { message: String(err && err.message || err) });
      }
      const dispose = () => { for (const d of disposers) { try { d(); } catch {} } };
      try { globalThis.__DSH_SESSION_PANEL_REGISTRATION__ = dispose; } catch {}
      return dispose;
    }

    function applyWithCtx(ctx) {
      injectStyle();
      diag('apply', { hasSlots: typeof ctx?.slots?.inject === 'function', hasInject: typeof ctx?.inject === 'function' });
      if (!ctx || typeof ctx.slots?.inject !== 'function' || typeof ctx.slots?.register !== 'function') return;
      pluginCtx = ctx;

      // 头部开关依赖原生导航控制器；sidebarRight 就绪后落库供组件调用。
      if (typeof ctx.inject === 'function') {
        const handle = ctx.inject(['sidebarRight'], (native) => {
          sidebarRightRef = native?.sidebarRight ?? null;
          diag('sidebar-right-injected', { hasToggle: typeof sidebarRightRef?.toggleExpanded === 'function' });
          // 只清自己写进去的那一份：重载时新旧回调交错，无条件置 null 会把
          // 新实例擦掉，按钮随即失效。
          const mine = sidebarRightRef;
          return () => { if (sidebarRightRef === mine) sidebarRightRef = null; };
        });
        if (typeof ctx.effect === 'function') ctx.effect(() => () => handle?.dispose?.(), 'dsh-session-panel: sidebarRight');
      }

      // 头部常驻开关：无论展开与否都在同一位置，压住「…」不在左右跳动。
      const disposeToggle = registerHeaderToggle(ctx);
      if (typeof ctx.effect === 'function') ctx.effect(() => () => disposeToggle?.dispose?.(), 'dsh-session-panel: header toggle');

      // sidebarRightTabs 由 sidebar-right 插件在自身 apply 顶层 provide，加载更晚；
      // 用 ctx.inject 等待其就绪后再注册（与 dsh-context 完全一致的时序处理方式）。
      if (typeof ctx.inject === 'function') {
        const handle = ctx.inject(['sidebarRightTabs'], registerTabType);
        // 把动态注入的生命周期挂到 ctx 上，插件卸载时释放。
        if (typeof ctx.effect === 'function') ctx.effect(() => () => handle?.dispose?.(), 'dsh-session-panel: tabs');
      } else if (ctx.sidebarRightTabs) {
        // 兼容：若服务已直接可用，立即注册。
        const dispose = registerTabType(ctx);
        if (typeof ctx.effect === 'function') ctx.effect(() => () => dispose?.(), 'dsh-session-panel: tabs');
      }
    }

    module.exports = { apply: applyWithCtx, inject };
    return module.exports;
  },
});
