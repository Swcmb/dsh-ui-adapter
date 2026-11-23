// client 半端到端行为测试：在 fake window 里执行真实的 lib/client.js，
// 驱动 apply/订阅/替换全流程，验证 mounted 门控、replaceTab、错误分支。
// 不依赖 DSH 运行时，也不改任何真实状态。
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'lib', 'client-default-sidebar-tab.js'), 'utf8');

/**
 * 在隔离的 fake window 中加载 client.js，返回它的 module.exports 与诊断快照。
 * @param {object} options.injected 注入到 window 的配置全局
 * @param {string} options.visibilityState 提供 document 时其 visibilityState
 *   （省略则不定义 document，模拟 client 运行在无 DOM 的宿主里）
 */
function loadClient(options = {}) {
  const store = new Map();
  const setTimeoutCalls = [];
  let intervalId = 0;
  let exported = null;

  const window = {
    __ModuleLoader__: {
      load({ factory }) {
        // 与 DSH 的加载器一致：factory 收到 require，返回 module.exports。
        exported = factory(() => ({}));
      },
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
    },
  };
  if (options.injected !== undefined) window.__DSH_DEFAULT_SIDEBAR_TAB__ = options.injected;

  const sandbox = {
    window,
    globalThis: window,
    setTimeout: (fn, ms) => {
      setTimeoutCalls.push({ fn, ms });
      return setTimeoutCalls.length;
    },
    clearTimeout: () => {},
    // 客户端用 setInterval 做只读 runtime-probe / replace 轮询；测试中不真正触发。
    setInterval: () => ++intervalId,
    clearInterval: () => {},
    JSON,
    Object,
    Array,
    String,
    Set,
    Map,
    Date,
    console,
  };
  // client 用 `typeof document !== 'undefined'` 判定离屏渲染器；只有显式要求时才提供。
  if (options.visibilityState !== undefined) {
    sandbox.document = { visibilityState: options.visibilityState };
  }

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });

  assert.ok(exported, 'client.js 必须通过 ModuleLoader 导出模块');
  const diag = () => {
    const raw = window.localStorage.getItem('dsh-default-sidebar-tab:diag');
    return raw ? JSON.parse(raw) : null;
  };
  return { exports: exported, diag, window, setTimeoutCalls, store };
}

/** 可观测的 fake sidebarRight。 */
function makeSidebar(initial = {}) {
  const state = {
    mounted: initial.mounted ?? undefined,
    tabs: initial.tabs ?? [],
    // 原生 sidebarRight.isExpanded()。undefined = 该 API 不存在（走「不检查」路径）；
    // false = 右栏收起（client 应跳过替换，见 skip-collapsed 分支）。
    expanded: initial.expanded,
  };
  const listeners = { mounted: new Set(), tabs: new Set() };
  const calls = [];

  const signal = (getter) => ({
    getSnapshot: getter,
    subscribe: (fn) => { const s = new Set(); s.add(fn); return () => s.delete(fn); },
  });

  const sidebar = {
    openTab(kind, opts) {
      calls.push({ kind, opts });
      if (state.mounted === undefined) {
        throw new Error('sidebarRight: no session surface is mounted');
      }
      // 模拟原生 replaceTab 语义：新 tab 顶替旧 tab 的位置，旧 tab 关闭。
      const idx = state.tabs.findIndex((t) => t.tabId === opts?.replaceTab);
      const next = { tabId: `new-${kind}`, kind, sessionId: state.mounted };
      if (idx >= 0) state.tabs.splice(idx, 1, next);
      else state.tabs.push(next);
      emit();
    },
    mounted: {
      getSnapshot: () => state.mounted,
      subscribe: (fn) => { listeners.mounted.add(fn); return () => listeners.mounted.delete(fn); },
    },
    openTabs: {
      getSnapshot: () => state.tabs.slice(),
      subscribe: (fn) => { listeners.tabs.add(fn); return () => listeners.tabs.delete(fn); },
    },
  };
  // 只有显式交出 expanded 时才提供 isExpanded：undefined 表示「原生无此 API」。
  if (initial.expanded !== undefined) {
    sidebar.isExpanded = () => state.expanded;
  }

  function emit() {
    for (const fn of listeners.tabs) fn();
    for (const fn of listeners.mounted) fn();
  }

  return {
    sidebar,
    calls,
    state,
    setMounted(v) { state.mounted = v; emit(); },
    setTabs(v) { state.tabs = v; emit(); },
    setExpanded(v) { state.expanded = v; emit(); },
    emit,
  };
}

/** 构造一个把 sidebarRight 直接给到 apply 的 ctx（走 ctx.get 分支）。 */
function makeCtx(sidebar) {
  return {
    inject: undefined,
    get: (name) => (name === 'sidebarRight' ? sidebar : undefined),
    effect: undefined,
  };
}

test('加载即执行，并写入 collected 诊断（loaded 阶段）', () => {
  const { diag } = loadClient();
  const d = diag();
  assert.ok(d, '必须写入诊断键');
  assert.equal(d.stage, 'loaded');
  assert.equal(d.events[0].stage, 'loaded');
});

test('没有已挂载会话时不动手：不调用 openTab，也不报错', () => {
  const { exports, diag } = loadClient();
  const fake = makeSidebar({
    mounted: undefined,
    tabs: [{ tabId: 'tab2', kind: 'guide', sessionId: 'session-a' }],
  });
  exports.apply(makeCtx(fake.sidebar));

  assert.equal(fake.calls.length, 0, 'mounted 为空时不应尝试 openTab');
  const stages = diag().events.map((e) => e.stage);
  assert.ok(stages.includes('attached'), '应完成接线');
  assert.ok(!stages.includes('replaced'), '不应发生替换');
  assert.ok(!stages.includes('openTab-error'), '不应报错');
});

test('mounted 会话有 guide 时，用 replaceTab 原位替换', () => {
  const { exports, diag } = loadClient({ injected: { defaultTab: 'session-inspector-log', enabled: true } });
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [
      { tabId: 'tab1', kind: 'guide', sessionId: 'session-a' },
      { tabId: 'tab9', kind: 'guide', sessionId: 'session-b' },
    ],
  });
  exports.apply(makeCtx(fake.sidebar));

  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].kind, 'session-inspector-log');
  assert.equal(fake.calls[0].opts.replaceTab, 'tab1', '只能替换当前会话的 guide');
  assert.equal(diag().stage, 'replaced');
  // 另一个会话的 guide 不受影响
  assert.ok(fake.state.tabs.some((t) => t.tabId === 'tab9' && t.kind === 'guide'));
});

test('会话里没有 guide 时不动作', () => {
  const { exports } = loadClient();
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [{ tabId: 'tab1', kind: 'files', sessionId: 'session-a' }],
  });
  exports.apply(makeCtx(fake.sidebar));
  assert.equal(fake.calls.length, 0);
});

test('会话界面后挂载：先不动，mounted 出现后替换', () => {
  const { exports, diag } = loadClient();
  const fake = makeSidebar({
    mounted: undefined,
    tabs: [{ tabId: 'tab2', kind: 'guide', sessionId: 'session-a' }],
  });
  exports.apply(makeCtx(fake.sidebar));
  assert.equal(fake.calls.length, 0);

  fake.setMounted('session-a');
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].opts.replaceTab, 'tab2');
  assert.equal(diag().stage, 'replaced');
});

test('no session surface 错误不计重试、不放弃', () => {
  const { exports, diag, setTimeoutCalls } = loadClient();
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [{ tabId: 'tab2', kind: 'guide', sessionId: 'session-a' }],
  });
  // 让 openTab 抛 "no session surface"，模拟界面切换瞬间。
  fake.sidebar.openTab = () => {
    throw new Error('sidebarRight: no session surface is mounted');
  };
  exports.apply(makeCtx(fake.sidebar));

  const stages = diag().events.map((e) => e.stage);
  assert.ok(stages.includes('wait-surface'), '应记为 wait-surface');
  assert.ok(!stages.includes('openTab-error'), '不应记为失败');
  assert.equal(setTimeoutCalls.length, 0, '不应安排重试');
});

test('kind 未注册（其它错误）走有限重试', () => {
  const { exports, diag, setTimeoutCalls } = loadClient();
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [{ tabId: 'tab2', kind: 'guide', sessionId: 'session-a' }],
  });
  fake.sidebar.openTab = () => { throw new Error('unknown tab kind: nope'); };
  exports.apply(makeCtx(fake.sidebar));

  assert.equal(diag().stage, 'openTab-error');
  assert.equal(setTimeoutCalls.length, 1, '应安排一次重试');
});

test('enabled:false 或 defaultTab=guide 时完全不动', () => {
  for (const injected of [{ defaultTab: 'session-inspector-log', enabled: false }, { defaultTab: 'guide', enabled: true }]) {
    const { exports } = loadClient({ injected });
    const fake = makeSidebar({
      mounted: 'session-a',
      tabs: [{ tabId: 'tab1', kind: 'guide', sessionId: 'session-a' }],
    });
    exports.apply(makeCtx(fake.sidebar));
    assert.equal(fake.calls.length, 0, `不应动作: ${JSON.stringify(injected)}`);
  }
});

test('同一 guide 只替换一次，不重复 openTab', () => {
  const { exports } = loadClient();
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [{ tabId: 'tab1', kind: 'guide', sessionId: 'session-a' }],
  });
  exports.apply(makeCtx(fake.sidebar));
  assert.equal(fake.calls.length, 1);

  fake.emit();
  fake.emit();
  assert.equal(fake.calls.length, 1, '重复触发订阅不应再次 openTab');
});

// ---------------------------------------------------------------------------
// 回归：runReplace 的两个 skip 分支必须真的可达
//
// 早前版本把 `const guide = guides[0]` 写在两个 skip 分支之后，而分支里要读
// `guide.tabId`。那落在 const 的暂时性死区里，每次命中都会抛
// `ReferenceError: Cannot access 'guide' before initialization`，被订阅回调吞掉
// （实机上 skip-collapsed / skip-hidden-renderer 各 0 次，而 apiIsExpanded 全程
// 为 false，1396 次探针无一命中）。这两条测试锁住分支可达性与不抛错。
// ---------------------------------------------------------------------------

test('右栏收起时不替换，且记录 skip-collapsed（不抛 ReferenceError）', () => {
  const { exports, diag, setTimeoutCalls } = loadClient();
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [{ tabId: 'tab1', kind: 'guide', sessionId: 'session-a' }],
    expanded: false,
  });

  // 若 skip 分支抛错，错误会从 apply 里冒出来（runReplace 在 apply 内同步执行）。
  exports.apply(makeCtx(fake.sidebar));

  assert.equal(fake.calls.length, 0, '右栏收起时不应 openTab');
  const stages = diag().events.map((e) => e.stage);
  assert.ok(stages.includes('skip-collapsed'), `应记录 skip-collapsed，实际: ${stages.join(',')}`);
  assert.ok(!stages.includes('replaced'), '不应替换');
  assert.equal(setTimeoutCalls.length, 0, 'skip 不是失败，不应安排重试');
  const event = diag().events.find((e) => e.stage === 'skip-collapsed');
  assert.equal(event.tabId, 'tab1', 'skip 事件必须带上 guide 的 tabId');
  assert.equal(event.sessionId, 'session-a', 'skip 事件必须带上 sessionId');
});

test('右栏展开时同一会话的 guide 照常替换（对照 skip-collapsed）', () => {
  const { exports, diag } = loadClient({ injected: { defaultTab: 'session-inspector-log', enabled: true } });
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [{ tabId: 'tab1', kind: 'guide', sessionId: 'session-a' }],
    expanded: true,
  });
  exports.apply(makeCtx(fake.sidebar));

  assert.equal(fake.calls.length, 1, '展开状态应替换');
  assert.equal(fake.calls[0].opts.replaceTab, 'tab1');
  const stages = diag().events.map((e) => e.stage);
  assert.ok(stages.includes('replaced'));
  assert.ok(!stages.includes('skip-collapsed'), '不应误判为收起');
});

test('离屏渲染器（visibilityState:hidden）不替换，记录 skip-hidden-renderer', () => {
  const { exports, diag } = loadClient({ visibilityState: 'hidden' });
  const fake = makeSidebar({
    mounted: 'session-a',
    tabs: [{ tabId: 'tab1', kind: 'guide', sessionId: 'session-a' }],
    expanded: true,
  });
  exports.apply(makeCtx(fake.sidebar));

  assert.equal(fake.calls.length, 0, '离屏渲染器不应改动共享布局');
  const stages = diag().events.map((e) => e.stage);
  assert.ok(stages.includes('skip-hidden-renderer'), `应记录 skip-hidden-renderer，实际: ${stages.join(',')}`);
  assert.ok(!stages.includes('replaced'));
});
