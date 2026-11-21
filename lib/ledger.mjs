// dsh-context-bili-bridge  —  billion-context 账本到 dsh-context tokenUsage 的映射
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

export const DEFAULTS = Object.freeze({
  origin: 'http://127.0.0.1:18787',
  pollMs: 5000,
  patchUsage: true,
  switchLabel: '压缩账本',
  lang: 'zh',
});

export function resolveConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const origin = typeof input.origin === 'string' && input.origin.trim()
    ? input.origin.trim().replace(/\/+$/, '')
    : DEFAULTS.origin;
  const pollMs = Number.isFinite(input.pollMs) && input.pollMs >= 1000
    ? Math.floor(input.pollMs)
    : DEFAULTS.pollMs;
  return {
    origin,
    pollMs,
    patchUsage: input.patchUsage !== false,
    switchLabel: typeof input.switchLabel === 'string' && input.switchLabel.trim()
      ? input.switchLabel.trim()
      : DEFAULTS.switchLabel,
    lang: typeof input.lang === 'string' && input.lang.trim()
      ? input.lang.trim()
      : DEFAULTS.lang,
  };
}

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);

/**
 * billion /__bili/sessions reports `inputTokens` as the BILLED INPUT TOTAL
 * (cache hits included). dsh-context's tokenUsage splits that total into
 * uncachedInputTokens + cacheReadTokens + cacheWriteTokens. The split must be
 * lossless: dsh-context derives its total and hit rate from those three fields.
 */
export function toUsage(session) {
  if (!session || typeof session !== 'object') return null;
  const input = finite(session.inputTokens);
  const cached = finite(session.cachedTokens);
  if (input === 0 && cached === 0 && finite(session.outputTokens) === 0) return null;
  const cacheRead = Math.min(cached, input);
  return {
    uncachedInputTokens: Math.max(0, input - cacheRead),
    outputTokens: finite(session.outputTokens),
    cacheReadTokens: cacheRead,
    // billion's session ledger does not expose cache-write tokens. Reporting 0
    // is the conservative choice: it keeps the billed-input total exact.
    cacheWriteTokens: 0,
  };
}

/**
 * billion labels a session `session-<uuid>` and suffixes sub-agents with
 * `|sub:<hash>`, while DSH hands us the bare conversation id. Comparing the raw
 * strings therefore misses every real session, so both sides are reduced to a
 * common key before any comparison.
 */
export function normalizeSessionKey(value) {
  if (typeof value !== 'string') return '';
  let key = value.trim();
  if (!key) return '';
  const pipe = key.indexOf('|');
  if (pipe !== -1) key = key.slice(0, pipe);
  if (key.startsWith('session-')) key = key.slice('session-'.length);
  return key.trim().toLowerCase();
}

const sessionKeys = (s) => [
  s?.conversationId, s?.hostSessionId, s?.id, s?.label,
].map(normalizeSessionKey).filter(Boolean);

/** Newest first, so a fallback picks the session the user is actually in. */
const byLastSeen = (a, b) => {
  const ta = Date.parse(a?.lastSeen ?? '') || 0;
  const tb = Date.parse(b?.lastSeen ?? '') || 0;
  return tb - ta;
};

/**
 * Pick the billion session that belongs to a DSH conversation.
 * Returns `{session, match}` where match is 'exact' | 'loose' | 'fallback' |
 * 'none'. Callers must distinguish "billion is down" from "billion is up but
 * this conversation has no ledger yet" — they read very differently to a user.
 */
export function pickSessionDetailed(payload, conversationId) {
  const sessions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.sessions)
      ? payload.sessions
      : [];
  if (sessions.length === 0) return { session: null, match: 'none' };
  const needle = normalizeSessionKey(conversationId);
  if (needle) {
    const exact = sessions.find((s) => sessionKeys(s).includes(needle));
    if (exact) return { session: exact, match: 'exact' };
    const loose = sessions.find((s) => sessionKeys(s).some((k) => k.includes(needle) || needle.includes(k)));
    if (loose) return { session: loose, match: 'loose' };
  }
  if (sessions.length === 1) return { session: sessions[0], match: 'fallback' };
  // Multiple ledgers and no id: report the freshest one instead of pretending
  // the ledger is unreachable.
  const newest = [...sessions].sort(byLastSeen)[0];
  return newest ? { session: newest, match: 'fallback' } : { session: null, match: 'none' };
}

export function pickSession(payload, conversationId) {
  return pickSessionDetailed(payload, conversationId).session;
}

export function hitRate(usage) {
  if (!usage) return 0;
  const billed = finite(usage.uncachedInputTokens) + finite(usage.cacheReadTokens) + finite(usage.cacheWriteTokens);
  return billed > 0 ? (finite(usage.cacheReadTokens) / billed) * 100 : 0;
}

export function billedTotal(usage) {
  if (!usage) return 0;
  return finite(usage.uncachedInputTokens) + finite(usage.cacheReadTokens)
    + finite(usage.cacheWriteTokens) + finite(usage.outputTokens);
}

export function sessionsUrl(origin) {
  return `${String(origin).replace(/\/+$/, '')}/__bili/sessions`;
}

/**
 * The panel URL for the in-page iframe.
 *
 * `?embed=1` is billion's "framed inside a host settings page" face: it hides
 * the top bar, narrows every table and — the reason the window looked empty —
 * paints the canvas with `--bg: transparent`. The switch is a full-size overlay,
 * so the normal face plus an explicit `?theme=` is the right surface here.
 */
export function ledgerUrl(origin, sessionId, theme) {
  const base = `${String(origin).replace(/\/+$/, '')}/__bili/`;
  const query = theme === 'light' || theme === 'dark' ? `?theme=${theme}` : '';
  const hash = sessionId ? `#/session/${encodeURIComponent(sessionId)}` : '#/sessions';
  return base + query + hash;
}

/** Same-origin host-proxy route the client polls (avoids billion's missing CORS). */
export const SESSIONS_ROUTE = '/__ctx-bili/sessions';
export const STATUS_ROUTE = '/__ctx-bili/status';
/** Same-origin route the client half POSTs renderer diagnostics to (.host.log). */
export const DIAG_ROUTE = '/__ctx-bili/diag';
