// dsh-default-sidebar-tab — client half (原生 DSH web module)
// 用户打开右侧栏、原生播种「开始」页(guide)时，用配置的 tab 原位替换它。
// 只依赖原生 DSH：window.__ModuleLoader__ + ctx.sidebarRight（原生导航控制器）+ 全局配置注入。
// 不依赖任何第三方插件、不改任何包、不直接改写 sidebar 的持久化状态。
// Copyright (C) 2026 Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later

window.__ModuleLoader__.load({
  id: '@local/dsh-default-sidebar-tab',
  factory: (require) => {
    'use strict';
    const module = { exports: {} };
    // slots 是早期稳定服务；sidebarRight 由原生 sidebar-right 包在 apply 阶段 provide，
    // 加载时序更晚，因此在 apply 内用 ctx.inject 动态等待它就绪。
    const inject = ['slots'];

    const INJECT_GLOBAL = '__DSH_DEFAULT_SIDEBAR_TAB__';
    const DIAG_KEY = 'dsh-default-sidebar-tab:diag';
    const DEFAULT_TAB = 'dsh-session-details';
    const GUIDE_KIND = 'guide';
    const MAX_RETRIES = 10;      // kind 可能稍后才注册；覆盖约 5s
    const RETRY_MS = 500;
    // 右侧栏默认宽度。原生不设时会按 viewport * 0.45 取（1463 窗口下约 658px），
    // 而原生下限 RIGHTBAR_MIN = 300。这里直接钉到下限：够放详情栏的行与数值。
    const RIGHTBAR_WIDTH = 300;

    // ---- 自证日志 ----------------------------------------------------------
    // 只写本插件自己的键，绝不触碰原生侧栏布局存储。
    // 目的是让外部（读 LevelDB / devtools）能判断 client 半是否执行、卡在哪一步。
    const diag = { stage: 'module-evaluated', at: Date.now(), events: [] };
    function mark(stage, extra) {
      const event = extra ? { t: Date.now(), stage, ...extra } : { t: Date.now(), stage };
      try {
        diag.stage = stage;
        diag.at = Date.now();
        diag.events.push(event);
        if (diag.events.length > 16) diag.events.shift();
        window.localStorage.setItem(DIAG_KEY, JSON.stringify(diag));
      } catch { /* 存储不可用时静默，不影响主功能 */ }
      // 同时上报宿主侧：与 session-panel 共用同一条诊断通道，落盘后可直接核对。
      try {
        fetch('/__dsh-session-panel/diag', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ events: [event] }),
        }).catch(() => {});
      } catch { /* 宿主未就绪时静默 */ }
    }
    mark('loaded');

    function readConfig() {
      try {
        const value = window[INJECT_GLOBAL];
        if (value && typeof value === 'object') {
          const tab = typeof value.defaultTab === 'string' && value.defaultTab.trim() !== ''
            ? value.defaultTab.trim() : DEFAULT_TAB;
          return { defaultTab: tab, enabled: value.enabled !== false };
        }
      } catch { /* 全局未注入时用默认值 */ }
      return { defaultTab: DEFAULT_TAB, enabled: true };
    }

    // 把右侧栏的默认宽度压到 RIGHTBAR_WIDTH。
    //
    // 原生只在 openRightbar 里用 `rightbar ??= viewport * 0.45` 播种一次，
    // 之后记忆用户的拖拽结果。这里在播种前先写入，`??=` 便不会覆盖它；
    // 已经展开过（值已存在）时则尊重现有值，不去改用户手动调过的宽度。
    function setRightbarWidth(layout, sidebar) {
      try {
        const panels = layout?.panels;
        if (!panels || typeof panels.setRightbar !== 'function') {
          mark('rightbar-width-unavailable', {
            hasLayout: !!layout,
            hasPanels: !!panels,
          });
          return false;
        }
        // setRightbar 内部会 clamp 到 [300, viewport*0.7]，300 正好是下限。
        const before = sidebar?.isExpanded?.() === true;
        panels.setRightbar(RIGHTBAR_WIDTH);
        mark('rightbar-width-set', { width: RIGHTBAR_WIDTH, wasExpanded: before });
        return true;
      } catch (err) {
        mark('rightbar-width-failed', { message: String(err?.message ?? err) });
        return false;
      }
    }

    function attach(sidebar) {
      const { defaultTab, enabled } = readConfig();
      mark('attached', { defaultTab, enabled, keys: Object.keys(sidebar ?? {}).slice(0, 20) });
      if (!enabled || defaultTab === GUIDE_KIND) return () => {};
      // 按 guide 的 tabId 去重：一个 guide 一旦被替换就永不再碰。
      // 不按 sessionId 去重 —— 实测 openTabs 是跨会话的全局列表，
      // 而 mounted 指向的会话未必是刚播种 guide 的那个，按会话匹配会永久漏判。
      const handledTabs = new Set();
      const skipLogged = new Set();   // 已记录过的「本次跳过原因」，仅抑制日志刷屏，不影响判定
      const attempts = new Map();    // tabId -> 已重试次数
      const timers = new Set();
      let disposed = false;
      let lastProbe = '';

      const currentSession = () => {
        try { return sidebar.mounted?.getSnapshot?.(); } catch { return undefined; }
      };
      const openTabsOf = () => {
        let tabs = [];
        try { tabs = sidebar.openTabs?.getSnapshot?.() ?? []; } catch { tabs = []; }
        return Array.isArray(tabs) ? tabs : [];
      };
      const guideTabsOf = () => openTabsOf().filter(
        (t) => t && t.kind === GUIDE_KIND && typeof t.tabId === 'string' && !handledTabs.has(t.tabId)
      );
      const scheduleRetry = (tabId) => {
        const count = attempts.get(tabId) ?? 0;
        if (count >= MAX_RETRIES) {
          mark('give-up', { tabId, reason: 'kind-not-registered-or-openTab-failed' });
          return;
        }
        attempts.set(tabId, count + 1);
        const timer = setTimeout(runReplace, RETRY_MS);
        timers.add(timer);
      };

      // 每轮只处理一个 guide：openTab 会改变布局并触发订阅，逐个处理避免连锁副作用。
      function runReplace() {
        if (disposed) return;
        // openTab 的原生前置条件：必须有一个已挂载的会话界面（否则抛 no session surface）。
        // 没有它时什么都不做，等 mounted 变化再进来 —— 不重试、不报错、不打扰。
        const sessionId = currentSession();
        if (typeof sessionId !== 'string' || sessionId === '') return;

        // 只替换当前挂载会话自己的 guide：别的会话的 guide 不属于"我现在看到的右栏"。
        // 实测 guide tab 的 sessionId 可能与 mounted 不同（guide 是每个 pane 一份的全局页），
        // 所以先按会话精确匹配，匹配不到再退回唯一的 guide —— 否则永远不替换。
        // 只替换「当前挂载会话」自己的 guide —— 用户在右栏看到的就是这个会话的布局。
        // 其它会话的 guide 属于后台会话，不该被动到。
        const guides = guideTabsOf().filter((t) => t.sessionId === sessionId);
        if (guides.length === 0) return;
        // 离屏/后台渲染器不参与。
        //
        // DSH 桌面端除了可见窗口还有隐藏的渲染进程（实测同一页面跑在 618x1063 的
        // 离屏视图里，document.hidden=true）。它们与本窗口同源，共用同一份
        // localStorage 布局。在这里替换 guide 会把「展开右栏」写进共享布局，
        // 可见窗口读到 expanded=true 后，角落的展开按钮按原生规则直接不渲染 ——
        // 用户在可见窗口里看到的就是「按钮莫名消失」。
        // 只让用户眼前那个渲染器改动布局。
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          if (!skipLogged.has(guide.tabId)) {
            skipLogged.add(guide.tabId);
            mark('skip-hidden-renderer', { tabId: guide.tabId, visibility: document.visibilityState });
          }
          return;
        }
        // 只在右栏本来就展开时替换。
        //
        // 原生 openContent 在打开任何 tab 时都会一并 planSetExpanded(state, true)，
        // 也就是说「替换 guide」会顺手把收起的右栏顶开。而原生展开按钮
        // （conversation.session.header.corner 的 ExpandButton）在桌面端
        // `expanded === true` 时直接 return null —— 按钮会当场消失。
        // 右栏收起时不去动它：角落按钮留在原位，用户点它展开后，
        // guide 才被换成会话详情。收起状态是用户的选择，插件不替用户决定。
        if (typeof sidebar.isExpanded === 'function' && sidebar.isExpanded() === false) {
          if (!skipLogged.has(guide.tabId)) {
            skipLogged.add(guide.tabId);
            mark('skip-collapsed', { tabId: guide.tabId, sessionId: guide.sessionId });
          }
          return;
        }
        const guide = guides[0];
        try {
          // 原生 replaceTab：新 tab 取代 guide 的位置并关掉 guide；
          // 若该 kind 已打开则直接聚焦它，不会开重复。
          //
          // 关键：guide tab 可能属于「另一个 session」（实测 guide 是每 pane 一份的全局页，
          // 其 sessionId 常常不等于 mounted）。而 openTab 只作用于 mounted 会话，
          // 拿另一个 session 的 tabId 去 replace 必然落空或抛
          // "no session surface is mounted"。openTabIn(sessionId, ...) 才能对该 session
          // 的布局动手 —— 正是 guide 真正所属的那个 session。
          if (typeof sidebar.openTabIn === 'function') {
            sidebar.openTabIn(guide.sessionId, defaultTab, { replaceTab: guide.tabId });
          } else {
            sidebar.openTab(defaultTab, { replaceTab: guide.tabId });
          }
          // 状态层自证：替换后立刻读 openTabs 快照，确认目标 kind 真的出现在
          // 该会话的打开列表里（而不是"调用没抛错就算成功"）。
          const after = openTabsOf().filter((t) => t?.kind === defaultTab);
          handledTabs.add(guide.tabId);
          attempts.delete(guide.tabId);
          mark('replaced', {
            tabId: guide.tabId,
            sessionId: guide.sessionId,
            kind: defaultTab,
            verified: after.length > 0,
            targetTabs: after.map((t) => ({ tabId: t?.tabId, sessionId: t?.sessionId, kind: t?.kind })),
            guideStillOpen: openTabsOf().filter((t) => t?.kind === GUIDE_KIND).map((t) => t?.tabId),
          });
        } catch (err) {
          const message = String(err?.message ?? err);
          if (/no session surface is mounted/i.test(message)) {
            // 会话界面正在切换/尚未就绪：等下一次 mounted 变化，不计失败次数。
            mark('wait-surface', { tabId: guide.tabId });
            return;
          }
          mark('openTab-error', { tabId: guide.tabId, kind: defaultTab, message });
          // 配置的 kind 未注册（对应插件没装/没启用）→ 有限重试后放弃，保留原生开始页。
          scheduleRetry(guide.tabId);
        }
      }

      const onChange = () => {
        const sessionId = currentSession();
        const tabs = openTabsOf();
        // 只在状态变化时记录探测快照，避免刷屏。
        const snapshot = JSON.stringify({
          sessionId,
          tabs: tabs.map((t) => `${t?.sessionId}|${t?.kind}|${t?.tabId}`),
        });
        if (snapshot !== lastProbe) {
          lastProbe = snapshot;
          mark('probe', {
            mounted: sessionId,
            mineGuides: tabs
              .filter((t) => t?.kind === GUIDE_KIND && t?.sessionId === sessionId)
              .map((t) => t.tabId),
            allGuides: tabs.filter((t) => t?.kind === GUIDE_KIND).length,
            tabCount: tabs.length,
            // 记录 guide 的完整身份，便于核对 sessionId 匹配问题。
            guideTabs: tabs
              .filter((t) => t?.kind === GUIDE_KIND)
              .map((t) => ({ tabId: t?.tabId, sessionId: t?.sessionId, kind: t?.kind })),
            // 目标 kind 是否已出现在打开的 tab 里。
            targetOpen: tabs.filter((t) => t?.kind === defaultTab).map((t) => t?.tabId),
          });
        }
        runReplace();
      };

      const unsubMounted = sidebar.mounted?.subscribe?.(onChange);
      const unsubTabs = sidebar.openTabs?.subscribe?.(onChange);

      // 活体探针：只读原生 API 与布局存储，回答
      //   「会话详情 tab 打开了没有」「右栏列有没有真的展开」
      // 「原生展开按钮为什么不在场」这三个问题。
      // 全程不点任何按钮、不看渲染结果，只读状态。
      function probeRuntime() {
        try {
          const sessionId = currentSession();
          let expanded = null;
          let mode = null;
          try { expanded = sidebar.isExpanded?.() ?? null; } catch { /* 无 API */ }
          // 布局存储里的同一会话
          let stored = null;
          try {
            const key = 'dsh.sidebar-right.v1.' + sessionId;
            const env = JSON.parse(localStorage.getItem(key) || 'null');
            const layout = env?.bySession?.[sessionId]?.layout;
            if (layout) stored = { expanded: layout.expanded === true, mode: layout.mode ?? null };
          } catch { /* 存储不可读 */ }
          mark('runtime-probe', {
            mounted: sessionId,
            apiIsExpanded: expanded,
            stored,
            openTabs: openTabsOf().map((t) => ({ tabId: t?.tabId, sessionId: t?.sessionId, kind: t?.kind })),
            hasSetExpanded: typeof sidebar.setExpanded === 'function',
            hasToggleExpanded: typeof sidebar.toggleExpanded === 'function',
            hasOpen: typeof sidebar.open === 'function',
          });
        } catch (err) {
          mark('runtime-probe-failed', { message: String(err?.message ?? err) });
        }
      }
      const probeTimer = setInterval(probeRuntime, 2000);
      probeRuntime();
      // 展开状态不是 openTabs/mounted 的订阅源，用户点开右栏时这两者都不一定变化。
      // 轻量轮询补上这一条：只读 isExpanded() + 快照，不写任何状态，开销是一次函数调用。
      const expandTimer = setInterval(runReplace, 600);

      // 首帧：会话与布局可能在插件加载前就就绪。
      onChange();

      return () => {
        disposed = true;
        try { clearInterval(probeTimer); } catch { /* 忽略 */ }
        try { clearInterval(expandTimer); } catch { /* 忽略 */ }
        for (const t of timers) { try { clearTimeout(t); } catch { /* 忽略 */ } }
        timers.clear();
        try { unsubMounted?.(); } catch { /* 忽略 */ }
        try { unsubTabs?.(); } catch { /* 忽略 */ }
      };
    }

    function applyWithCtx(ctx) {
      if (!ctx) { mark('apply-no-ctx'); return; }
      mark('apply', {
        hasInject: typeof ctx.inject === 'function',
        hasGet: typeof ctx.get === 'function',
        hasEffect: typeof ctx.effect === 'function',
      });

      // 兼容两种就绪方式：同步已有（ctx.get）与延迟提供（ctx.inject）。
      const tryAttach = (sidebar) => (sidebar && typeof sidebar.openTab === 'function' ? attach(sidebar) : null);

      if (typeof ctx.inject === 'function') {
        // 宽度单独注入：layout 是否作为可注入服务暴露，与 sidebarRight 无关。
        // 放同一个 inject 数组里，一旦 layout 不可注入，连 guide 替换都一起不触发。
        try {
          const layoutHandle = ctx.inject(['layout'], (native) => {
            setRightbarWidth(native?.layout, typeof ctx.get === 'function' ? ctx.get('sidebarRight') : undefined);
            return undefined;
          });
          if (typeof ctx.effect === 'function') ctx.effect(() => () => layoutHandle?.dispose?.(), 'dsh-default-sidebar-tab: layout width');
        } catch (err) {
          mark('layout-inject-threw', { message: String(err?.message ?? err) });
        }
        // 若布局早就绪，inject 未必回调，这里同步再试一次。
        try {
          if (typeof ctx.get === 'function') setRightbarWidth(ctx.get('layout'), ctx.get('sidebarRight'));
        } catch { /* 未就绪，等上面的 inject */ }

        let activeDispose = null;
        const handle = ctx.inject(['sidebarRight'], (native) => {
          activeDispose?.();
          activeDispose = tryAttach(native?.sidebarRight);
          if (!activeDispose) mark('sidebar-inject-not-ready', { keys: Object.keys(native ?? {}).slice(0, 20) });
          return activeDispose;
        });
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => { activeDispose?.(); handle?.dispose?.(); }, 'dsh-default-sidebar-tab: sidebar');
        }
        return;
      }

      const direct = typeof ctx.get === 'function' ? ctx.get('sidebarRight') : ctx.sidebarRight;
      setRightbarWidth(typeof ctx.get === 'function' ? ctx.get('layout') : ctx.layout, direct);
      const dispose = tryAttach(direct);
      if (dispose && typeof ctx.effect === 'function') {
        ctx.effect(() => () => dispose(), 'dsh-default-sidebar-tab: sidebar');
      }
      if (!dispose) mark('sidebar-unavailable', { direct: direct === undefined ? '<undefined>' : typeof direct });
    }

    module.exports = { apply: applyWithCtx, inject };
    return module.exports;
  },
});
