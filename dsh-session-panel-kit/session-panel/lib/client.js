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
