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
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8');

/**
 * 在隔离的 fake window 中加载 client.js，返回它的 module.exports 与诊断快照。
 * @param {object} options.injected 注入到 window 的配置全局
 */
function loadClient(options = {}) {
  const store = new Map();
  const setTimeoutCalls = [];
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
    JSON,
    Object,
    Array,
    String,
    Set,
    Map,
    Date,
    console,
  };

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
