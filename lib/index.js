// dsh-ui-adapter — unified host half (fused plugin suite)
// SPDX-License-Identifier: GPL-3.0-or-later
import { applyAdapter } from './host-adapter.mjs';
import { applySessionPanel } from './host-session-panel.mjs';
import { applyCsPanelHider } from './host-cs-panel-hider.mjs';

export const name = 'dsh-ui-adapter';
export const inject = ['webServer'];

export function apply(ctx, rawConfig = {}) {
  applyAdapter(ctx, rawConfig);
  applySessionPanel(ctx);
  applyCsPanelHider(ctx);
}
