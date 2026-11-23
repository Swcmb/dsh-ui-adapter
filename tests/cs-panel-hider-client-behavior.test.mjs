// cs-panel-hider client 半的行为测试：在 mock DOM 里执行真实的
// lib/client-cs-panel-hider.js，验证原生契约（模块 id、inject、apply 返回值）
// 与隐藏目标（CSS 规则、body 标记清理）。
//
// 平铺后的独立 client 半源码；融合入口的统一 lib/client.js 由 tests/client.test.mjs 覆盖，
// 那里同时断言本模块的 IIFE 已被内联进同一个 factory。
//
// 早前这份断言写在一个独立的 *.mjs 脚本里（csrf-panel-hider-mock-client.mjs），
// 不被 `node --test tests/*.test.mjs` 收集，所以它的校验从未计入测试总数。
// 这里改成标准 test 文件，让权重落到测试套件里。
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'lib', 'client-cs-panel-hider.js'), 'utf8');

/** 在 mock DOM 里加载 cs-panel-hider 的 client 半，返回可供断言的观测面。 */
function loadHider() {
  let loaded = null;
  const appended = [];
  const removedAttrs = new Set();
  const observed = [];

  const fakeStyle = { id: '', textContent: '', setAttribute() {}, remove() {} };
  const body = {
    hasAttribute: (n) => n === 'data-dsh-claude-session-panel',
    removeAttribute: (n) => removedAttrs.add(n),
    appendChild() {},
  };

  const sandbox = {
    window: { __ModuleLoader__: { load: (def) => { loaded = def; } } },
    document: {
      head: { appendChild: (el) => appended.push(el) },
      documentElement: {},
      body,
      getElementById: () => null,
      createElement: () => ({ ...fakeStyle }),
    },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe(target, opts) { observed.push({ target, opts }); }
      disconnect() { observed.push({ disconnected: true }); }
    },
    requestAnimationFrame: (fn) => fn(),
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => fn(),
    console, Date, Math, JSON, String, Array, Object, Promise, Error, Set, Map,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });

  assert.ok(loaded, 'client 半必须通过 ModuleLoader 注册模块');
  return { loaded, appended, removedAttrs, observed };
}

test('注册的模块 id 与原生契约（inject 为空、apply 返回 disposer）', () => {
  const { loaded } = loadHider();
  assert.equal(loaded.id, '@local/dsh-cs-panel-hider');
  const mod = loaded.factory(() => { throw new Error('unexpected require'); });
  assert.deepEqual(Array.from(mod.inject), [], 'inject 应为空：不依赖任何第三方模块');
  assert.equal(typeof mod.apply, 'function');

  const disposer = mod.apply();
  assert.equal(typeof disposer, 'function', 'apply 必须返回 disposer');
});

test('注入的 CSS 隐藏 claude-style 详情栏与其头部开关', () => {
  const { loaded, appended } = loadHider();
  const mod = loaded.factory(() => ({}));
  mod.apply();

  assert.ok(appended.length >= 1, '必须注入 <style>');
  const css = appended[0].textContent;
  assert.ok(css.includes('.dsh-claude-details-root'), '缺少详情栏选择器');
  assert.ok(css.includes('.dsh-claude-session-panel-button'), '缺少头部开关选择器');
  assert.ok(/display\s*:\s*none\s*!important/.test(css), '缺少强制隐藏规则');
});

test('清理 body 上的 dsh-claude 布局标记，不删除节点', () => {
  const { loaded, removedAttrs } = loadHider();
  const mod = loaded.factory(() => ({}));
  mod.apply();
  assert.ok(removedAttrs.has('data-dsh-claude-session-panel'), 'body 标记未被清理');
});

test('disposer 可调用，且会断开观察器', () => {
  const { loaded, observed } = loadHider();
  const mod = loaded.factory(() => ({}));
  const disposer = mod.apply();
  assert.equal(typeof disposer, 'function');
  assert.doesNotThrow(() => disposer(), 'disposer 不应抛错');
  assert.ok(observed.some((o) => o.disconnected === true), 'disposer 应断开 MutationObserver');
});