// dsh-ui-adapter  —  host half (Cordis plugin)
// Copyright (C) 2026  Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { resolveConfig } from './ledger.mjs';
import { registerRoutes } from './proxy.mjs';
import { log, describeContext } from './hostlog.mjs';

export const name = 'dsh-ui-adapter';

/**
 * Cordis only exposes a service on the plugin context once the plugin has
 * declared it here. Declaring it also defers `apply` until the service is live,
 * which is why the route below can read `ctx.webServer` synchronously instead of
 * waiting on a runtime `ctx.inject(...)` fork. (Verified against the two plugins
 * in this profile that own routes: dsh-docs-panel and @michengai/dsh-archive-manager
 * both declare module-level `inject` and neither uses ctx.inject at runtime.)
 */
export const inject = ['webServer'];

/**
 * The host half publishes configuration into the web page and exposes one
 * same-origin, read-only route for billion's ledger. It never edits a plugin
 * package, a DSH bundle, or billion-context's config file. All runtime work
 * (polling, the switch, the projection shim) lives in ./client.js.
 */
export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig);
  log('apply:enter', describeContext(ctx, 'ctx'));

  // The platform renders every index through `webserver/index-inject` with a
  // table of {kind:"global", name, value} rows (same carrier the platform's own
  // remote-access and connection-recovery services use).
  try {
    ctx.on('webserver/index-inject', (table) => {
      if (!Array.isArray(table)) return;
      table.push({ kind: 'global', name: '__DSH_CTX_BILI_BRIDGE__', value: config });
    });
    log('bind:index-inject');
  } catch (err) {
    log('bind:index-inject-throws', String(err?.message ?? err));
  }

  // Same-origin ledger route: the page cannot reach 127.0.0.1:<port> directly
  // because billion sends no CORS header.
  let webServer = null;
  try {
    webServer = ctx.webServer ?? null;
  } catch (err) {
    log('webserver-access-throws', String(err?.message ?? err));
  }
  if (webServer && typeof webServer.register === 'function') {
    try {
      const dispose = registerRoutes(webServer, () => config.origin);
      log('bind:routes-ok', { origin: config.origin });
      ctx.effect(() => () => {
        try { dispose?.(); } catch { /* already disposed */ }
      }, 'dsh-ui-adapter: ledger routes');
      log('bind:effect-owned');
    } catch (err) {
      log('bind:routes-throws', String(err?.message ?? err));
    }
  } else {
    log('bind:no-webserver', describeContext(ctx, 'ctx'));
  }

  log('apply:exit');
}
