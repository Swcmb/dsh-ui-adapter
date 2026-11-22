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
     * UI-3: claude-style's `aside.dsh-claude-details` is the only sidebar-style
     * 会话详情 panel (DSH's own stats is a dialog), so open it once on startup.
     * One-shot: if the reader later closes it, we do not fight them.
     */
    function openSessionPanelOnce() {
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc) return () => {};
      let done = false;
      const timer = setInterval(() => {
        if (done || !doc.body) return;
        if (doc.body.hasAttribute('data-dsh-claude-session-panel')) {
          done = true;
          clearInterval(timer);
          return;
        }
        const btn = doc.querySelector('.dsh-claude-session-panel-button');
        if (!btn) return;
        if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
        done = true;
        clearInterval(timer);
      }, 1200);
      return () => clearInterval(timer);
    }

    function apply(ctx) {
      const cfg = readConfig();
      ensurePatchStyle();
      try {
        ctx.effect(() => openSessionPanelOnce(), 'dsh-ui-adapter: session panel');
      } catch { openSessionPanelOnce(); }
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
