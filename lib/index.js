// dsh-ui-adapter — unified host half (fused plugin suite)
// SPDX-License-Identifier: GPL-3.0-or-later
import { applyAdapter } from './host-adapter.mjs';
// 2026-11-28: 会话详情内嵌侧边栏套件（session-panel / cs-panel-hider /
// default-sidebar-tab）按用户要求停用，仅保留 adapter。
// import { applySessionPanel } from './host-session-panel.mjs';
// import { applyCsPanelHider } from './host-cs-panel-hider.mjs';
// import { applyDefaultSidebarTab } from './host-default-sidebar-tab.mjs';

export const name = 'dsh-ui-adapter';
export const inject = ['webServer'];

export function apply(ctx, rawConfig = {}) {
  applyAdapter(ctx, rawConfig);
  // 会话详情侧边栏三模块已停用；上方注释掉的 import 仅作历史记录。
  // applySessionPanel(ctx);
  // applyCsPanelHider(ctx);
  // applyDefaultSidebarTab(ctx, rawConfig);
}
