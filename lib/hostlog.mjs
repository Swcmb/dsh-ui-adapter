// dsh-ui-adapter  —  host-half diagnostics
// Copyright (C) 2026  Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
//
// A plugin's host half runs inside the DSH process, where a failure to reach a
// service is swallowed by the plugin loader: nothing surfaces in the UI and the
// only visible symptom is "the route 404s". This writer exists so the next
// debugging round starts from facts instead of guesses. It appends one line per
// step of the registration path to `.host.log` next to this package, and never
// throws into the caller.

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const LOG_FILE = join(ROOT, '.host.log');

// The verifier imports the host half outside DSH; its writes must not land in
// the same file the running process uses for real diagnosis.
const DISABLED = process.env.DSH_CTX_BILI_BRIDGE_LOG === '0';

export function log(step, detail) {
  if (DISABLED) return;
  let tail = '';
  if (detail !== undefined) {
    try {
      tail = ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    } catch {
      tail = ' <unserializable>';
    }
  }
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} pid=${process.pid} ${step}${tail}\n`);
  } catch {
    // A read-only install directory must not break the plugin.
  }
}

/** Compact description of what a context can offer, for the log only. */
export function describeContext(ctx, label) {
  const has = (name) => {
    try {
      return typeof ctx?.[name];
    } catch {
      return 'throws';
    }
  };
  const get = (name) => {
    try {
      return ctx?.get?.(name) === undefined ? 'none' : 'present';
    } catch (err) {
      return `throws:${err?.message ?? err}`;
    }
  };
  return {
    where: label,
    inject: has('inject'),
    on: has('on'),
    effect: has('effect'),
    webServerProp: has('webServer'),
    webServerViaGet: typeof ctx?.get === 'function' ? get('webServer') : 'no-get',
    connectionViaGet: typeof ctx?.get === 'function' ? get('connection') : 'no-get',
  };
}
