// dsh-context-bili-bridge  —  same-origin proxy for billion-context's ledger
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

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SESSIONS_ROUTE, STATUS_ROUTE, DIAG_ROUTE } from './ledger.mjs';
import { log } from './hostlog.mjs';

/**
 * Why this file exists.
 *
 * billion-context serves its ledger on http://127.0.0.1:<port> with no
 * Access-Control-Allow-Origin header, and its own same-origin relay
 * (`/__bili`, gated by `security.adminRelay`) is off by default. A page running
 * inside DSH therefore cannot read the ledger at all: the browser blocks the
 * cross-origin fetch and the panel reports "billion 未运行" while the proxy is
 * in fact healthy.
 *
 * The host half already runs inside the DSH process, where no CORS applies. So
 * we expose one read-only route on the DSH web server and let the client poll
 * that instead. Nothing is written, and billion's config is left untouched.
 */

const ORIGIN_TTL_MS = 2000;
const FETCH_TIMEOUT_MS = 4000;

export function stateDir() {
  const xdg = process.env.XDG_STATE_HOME;
  const base = typeof xdg === 'string' && xdg.trim() ? xdg.trim() : join(homedir(), '.local', 'state');
  return join(base, 'billion-context');
}

/** billion writes `proxy-origin` when its proxy starts; it is the source of truth. */
export function readOriginFile(file = join(stateDir(), 'proxy-origin')) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const origin = typeof parsed?.origin === 'string' ? parsed.origin.trim().replace(/\/+$/, '') : '';
  if (!/^https?:\/\/\S+$/.test(origin)) return null;
  return {
    origin,
    pid: Number.isInteger(parsed?.pid) ? parsed.pid : null,
    lane: typeof parsed?.lane === 'string' ? parsed.lane : null,
  };
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return err?.code === 'EPERM';
  }
}

let cached = null;
let cachedAt = 0;
let cachedDir = '';

/**
 * Resolve the live proxy origin, preferring the instance file over the compiled
 * default so a port change (18787 → another lane) needs no code edit.
 */
export function resolveOrigin(fallback, { force = false } = {}) {
  const now = Date.now();
  const dir = stateDir();
  // The cache is keyed on the state directory too: a different XDG_STATE_HOME
  // (tests, a second account) must never inherit the previous answer.
  if (!force && cached && cachedDir === dir && now - cachedAt < ORIGIN_TTL_MS) return cached;
  const info = readOriginFile(join(dir, 'proxy-origin'));
  if (info && (info.pid === null || pidAlive(info.pid))) {
    cached = { ...info, source: 'instance-file' };
  } else {
    const origin = typeof fallback === 'string' && fallback ? fallback.replace(/\/+$/, '') : '';
    cached = origin ? { origin, pid: null, lane: null, source: 'config' } : null;
  }
  cachedAt = now;
  cachedDir = dir;
  return cached;
}

async function getJson(url) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`billion HTTP ${res.status}`);
  return res.json();
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * Register the two read-only routes on the DSH web server.
 * Returns a disposer; safe to call when webServer is unavailable.
 */
export function registerRoutes(webServer, getFallbackOrigin) {
  if (!webServer || typeof webServer.register !== 'function') return () => {};

  // A page that never reaches this route and a page that reaches it but fails
  // to render look identical from the outside ("billion 未运行"). Counting hits
  // here, throttled per route, separates the two in one glance at .host.log.
  const counters = { [SESSIONS_ROUTE]: 0, [STATUS_ROUTE]: 0, [DIAG_ROUTE]: 0 };
  const lastLoggedAt = { [SESSIONS_ROUTE]: 0, [STATUS_ROUTE]: 0, [DIAG_ROUTE]: 0 };
  const noteHit = (route, status) => {
    counters[route] += 1;
    const now = Date.now();
    if (now - lastLoggedAt[route] < 30000) return;
    lastLoggedAt[route] = now;
    log('route:hit', { route, status, hits: counters[route] });
  };

  const sessions = {
    kind: 'exact',
    path: SESSIONS_ROUTE,
    handler: async (_req, res) => {
      const info = resolveOrigin(getFallbackOrigin());
      if (!info) {
        noteHit(SESSIONS_ROUTE, 503);
        sendJson(res, 503, { error: { message: 'billion proxy origin unknown' } });
        return;
      }
      try {
        const payload = await getJson(`${info.origin}/__bili/sessions`);
        const count = Array.isArray(payload?.sessions) ? payload.sessions.length : 0;
        noteHit(SESSIONS_ROUTE, 200);
        sendJson(res, 200, payload);
        if (count === 0) log('route:empty-ledger', { origin: info.origin });
      } catch (err) {
        noteHit(SESSIONS_ROUTE, 502);
        sendJson(res, 502, {
          error: { message: err instanceof Error ? err.message : String(err), origin: info.origin },
        });
      }
    },
  };

  const status = {
    kind: 'exact',
    path: STATUS_ROUTE,
    handler: (_req, res) => {
      const info = resolveOrigin(getFallbackOrigin());
      noteHit(STATUS_ROUTE, 200);
      sendJson(res, 200, {
        origin: info?.origin ?? null,
        pid: info?.pid ?? null,
        live: Boolean(info),
        source: info?.source ?? null,
        hits: counters,
      });
    },
  };

  // Renderer diagnostics. The client half cannot write files, so it POSTs its
  // view of the world here and we append it to .host.log. Without this line of
  // sight, "统计卡暂未接管" could mean anything from "sessions service missing"
  // to "store.apply threw".
  const diag = {
    kind: 'exact',
    path: DIAG_ROUTE,
    handler: (req, res) => {
      noteHit(DIAG_ROUTE, 204);
      const finish = (text) => {
        try {
          const trimmed = typeof text === 'string' ? text.trim().slice(0, 600) : '';
          if (trimmed) log('client:diag', trimmed);
        } catch { /* never fatal */ }
        try {
          res.writeHead(204, { 'content-type': 'text/plain' });
          res.end();
        } catch { /* response already closed */ }
      };
      if (!req || typeof req.on !== 'function' || typeof req.method === 'string' && req.method === 'GET') {
        finish('');
        return;
      }
      const chunks = [];
      let settled = false;
      try {
        req.on('data', (chunk) => { if (!settled) chunks.push(chunk); });
        req.on('end', () => {
          if (settled) return;
          settled = true;
          finish(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', () => {
          if (settled) return;
          settled = true;
          finish('');
        });
      } catch {
        finish('');
      }
    },
  };

  const offs = [];
  for (const route of [sessions, status, diag]) {
    try {
      const off = webServer.register(route);
      if (typeof off === 'function') offs.push(off);
    } catch {
      // A build without prefix/exact route support simply keeps the client's
      // direct-origin fallback.
    }
  }
  return () => {
    for (const off of offs) {
      try { off(); } catch { /* already gone */ }
    }
  };
}
