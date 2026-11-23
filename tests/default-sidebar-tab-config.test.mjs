// 纯逻辑单测：配置解析与 guide 替换判定。
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConfig, shouldReplaceGuide, findGuideTab,
  DEFAULT_TAB, GUIDE_KIND, KNOWN_KINDS, INJECT_GLOBAL,
} from '../lib/config.mjs';

test('默认值：无配置时用会话数据诊断', () => {
  assert.deepEqual(resolveConfig(undefined), { defaultTab: DEFAULT_TAB, enabled: true });
  assert.deepEqual(resolveConfig(null), { defaultTab: DEFAULT_TAB, enabled: true });
  assert.deepEqual(resolveConfig({}), { defaultTab: DEFAULT_TAB, enabled: true });
});

test('defaultTab 非空字符串被采纳并 trim', () => {
  assert.equal(resolveConfig({ defaultTab: 'files' }).defaultTab, 'files');
  assert.equal(resolveConfig({ defaultTab: '  browser  ' }).defaultTab, 'browser');
});

test('defaultTab 空白/非字符串回退默认值', () => {
  assert.equal(resolveConfig({ defaultTab: '   ' }).defaultTab, DEFAULT_TAB);
  assert.equal(resolveConfig({ defaultTab: 42 }).defaultTab, DEFAULT_TAB);
  assert.equal(resolveConfig({ defaultTab: null }).defaultTab, DEFAULT_TAB);
});

test('enabled:false 关闭替换', () => {
  assert.equal(resolveConfig({ enabled: false }).enabled, false);
  assert.equal(resolveConfig({ enabled: true }).enabled, true);
  assert.equal(resolveConfig({}).enabled, true);
});

test('KNOWN_KINDS 含关键原生 tab 且不重复', () => {
  for (const k of ['session-inspector-log', 'guide', 'files', 'browser', 'terminal', 'dsh-context']) {
    assert.ok(KNOWN_KINDS.includes(k), `missing ${k}`);
  }
  assert.equal(new Set(KNOWN_KINDS).size, KNOWN_KINDS.length);
});

test('INJECT_GLOBAL / GUIDE_KIND 命名稳定', () => {
  assert.equal(INJECT_GLOBAL, '__DSH_DEFAULT_SIDEBAR_TAB__');
  assert.equal(GUIDE_KIND, 'guide');
});

const base = () => ({ enabled: true, defaultTab: DEFAULT_TAB, handled: new Set(), sessionId: 's-1' });

test('shouldReplaceGuide：正常会话应替换', () => {
  assert.equal(shouldReplaceGuide(base()), true);
});

test('shouldReplaceGuide：目标就是 guide 时不替换', () => {
  assert.equal(shouldReplaceGuide({ ...base(), defaultTab: 'guide' }), false);
});

test('shouldReplaceGuide：已处理过的会话不再替换', () => {
  assert.equal(shouldReplaceGuide({ ...base(), handled: new Set(['s-1']) }), false);
});

test('shouldReplaceGuide：enabled=false 或无会话不替换', () => {
  assert.equal(shouldReplaceGuide({ ...base(), enabled: false }), false);
  assert.equal(shouldReplaceGuide({ ...base(), sessionId: undefined }), false);
  assert.equal(shouldReplaceGuide({ ...base(), sessionId: '' }), false);
});

const guide = (sessionId, tabId = 'tab1') => ({ sessionId, tabId, kind: 'guide', contentId: 'sidebar://guide' });

test('findGuideTab：找到本会话的 guide', () => {
  const got = findGuideTab([guide('s-2'), guide('s-1', 'tab9')], 's-1');
  assert.equal(got?.tabId, 'tab9');
});

test('findGuideTab：只认 guide kind', () => {
  assert.equal(findGuideTab([{ sessionId: 's-1', tabId: 't', kind: 'files' }], 's-1'), undefined);
});

test('findGuideTab：必须有字符串 tabId', () => {
  assert.equal(findGuideTab([{ sessionId: 's-1', kind: 'guide' }], 's-1'), undefined);
});

test('findGuideTab：其它会话的 guide 不算', () => {
  assert.equal(findGuideTab([guide('s-2')], 's-1'), undefined);
});

test('findGuideTab：非数组不崩', () => {
  assert.equal(findGuideTab(null, 's-1'), undefined);
  assert.equal(findGuideTab(undefined, 's-1'), undefined);
});
