// 契约单测：client/host 源码仍使用原生 DSH 的正确 API 面。
// 防止后续改动误把补丁写成依赖第三方插件或错误的注入点。
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
const host = readFileSync(join(root, 'lib', 'index.mjs'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('client 走原生 ModuleLoader，ctx.inject 动态等待 sidebarRight', () => {
  assert.ok(client.includes('window.__ModuleLoader__.load'));
  assert.ok(client.includes("const inject = ['slots']"));
  assert.ok(client.includes("ctx.inject(['sidebarRight']"));
  assert.ok(client.includes('native?.sidebarRight'));
});

test('client 只用原生 API：mounted / openTabs / openTab', () => {
  assert.ok(client.includes('sidebar.mounted'));
  assert.ok(client.includes('sidebar.openTabs'));
  assert.ok(client.includes('sidebar.openTab('));
});

test('client 不碰 sidebar 布局存储、不依赖第三方插件', () => {
  // 允许写本插件自己的诊断键 dsh-default-sidebar-tab:diag（用于非截图验证），
  // 但绝不允许读写原生的 dsh.sidebar-right.* 布局存储。
  assert.ok(!client.includes('dsh.sidebar-right'), 'client must not touch native sidebar layout storage');
  for (const name of ['dsh-claude-style', 'dsh-context', 'better-sidebar', 'dsh-fish', 'session-panel']) {
    assert.ok(!client.includes(name), `client must not reference ${name}`);
  }
});

test('client 写自证诊断键，便于外部验证执行情况', () => {
  assert.ok(client.includes("'dsh-default-sidebar-tab:diag'"));
  assert.ok(client.includes('localStorage.setItem(DIAG_KEY'));
});

test('client 用 replaceTab 原位替换 guide，并有 disposer', () => {
  assert.ok(client.includes('replaceTab: guide.tabId'));
  assert.ok(client.includes("GUIDE_KIND = 'guide'"));
  assert.ok(client.includes('scheduleRetry'));
  assert.ok(/return\s*\(\)\s*=>\s*\{/.test(client));
});

test('host 用 webserver/index-inject 注入配置，不碰 index 文件', () => {
  assert.ok(host.includes("'webserver/index-inject'"));
  assert.ok(host.includes('INJECT_GLOBAL'));
  assert.ok(!host.includes('writeFileSync'));
});

test('package.json：私有独立包，client inject 声明原生 sidebar-right 与 modules', () => {
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, 'GPL-3.0-or-later');
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-sidebar-right',
    '@deepseek-ai/dsh-client-modules',
  ]);
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.manifestVersion, 1);
});
