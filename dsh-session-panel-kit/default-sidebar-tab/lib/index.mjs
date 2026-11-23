// dsh-default-sidebar-tab — host half (原生 DSH Cordis 插件)
// 读取 cordis 配置并把「默认展示的右边栏 tab」注入到页面，供 client 半读取。
// 不修改任何插件/包/cordis 产物；只依赖原生 DSH 的 webserver/index-inject 事件。
// Copyright (C) 2026 Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveConfig, INJECT_GLOBAL } from './config.mjs';

export const name = 'dsh-default-sidebar-tab';

function log(tag, detail) {
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.host.log');
    const line = `[dsh-default-sidebar-tab] ${tag}` + (detail === undefined ? '' : ' ' + JSON.stringify(detail)) + '\n';
    appendFileSync(file, line, 'utf8');
  } catch { /* 日志失败不影响功能 */ }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} rawConfig cordis 配置（profile 的 config 段）
 */
export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig);
  log('apply:enter', config);

  // 平台在渲染每个 index 页面时广播此事件；注入一行 {kind:'global',name,value}，
  // 与 DSH 自己的 remote-access / ui-adapter 使用同一载体。
  try {
    ctx.on('webserver/index-inject', (table) => {
      if (!Array.isArray(table)) return;
      table.push({ kind: 'global', name: INJECT_GLOBAL, value: config });
    });
    log('bind:index-inject', { name: INJECT_GLOBAL });
  } catch (err) {
    log('bind:index-inject-throws', String(err?.message ?? err));
  }
}
