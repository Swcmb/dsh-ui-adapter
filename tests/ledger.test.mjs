// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, resolveConfig, toUsage, pickSession, pickSessionDetailed,
  normalizeSessionKey, hitRate, billedTotal, sessionsUrl, ledgerUrl,
  SESSIONS_ROUTE, STATUS_ROUTE,
} from '../lib/ledger.mjs';

test('resolveConfig applies defaults and normalizes origin', () => {
  assert.deepEqual(resolveConfig(null), DEFAULTS);
  assert.equal(resolveConfig({ origin: 'http://127.0.0.1:9999///' }).origin, 'http://127.0.0.1:9999');
  assert.equal(resolveConfig({ pollMs: 10 }).pollMs, DEFAULTS.pollMs);
  assert.equal(resolveConfig({ patchUsage: false }).patchUsage, false);
  assert.equal(resolveConfig({ switchLabel: '   ' }).switchLabel, DEFAULTS.switchLabel);
});

test('toUsage splits billed input losslessly (measured session values)', () => {
  const usage = toUsage({ inputTokens: 9879258, cachedTokens: 1728, outputTokens: 130106 });
  assert.deepEqual(usage, {
    uncachedInputTokens: 9877530,
    outputTokens: 130106,
    cacheReadTokens: 1728,
    cacheWriteTokens: 0,
  });
  assert.equal(billedTotal(usage), 10009364);
  assert.ok(Math.abs(hitRate(usage) - 0.017491) < 1e-5);
});

test('toUsage clamps a cacheRead larger than input instead of going negative', () => {
  const usage = toUsage({ inputTokens: 100, cachedTokens: 500, outputTokens: 0 });
  assert.deepEqual(usage, {
    uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 100, cacheWriteTokens: 0,
  });
});

test('toUsage rejects absent, malformed and all-zero ledgers', () => {
  assert.equal(toUsage(null), null);
  assert.equal(toUsage({ inputTokens: 'x', cachedTokens: NaN }), null);
  assert.equal(toUsage({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }), null);
});

test('pickSession prefers exact conversationId over loose match and single fallback', () => {
  const sessions = [
    { id: 'session-aaa', conversationId: 'conv-1', inputTokens: 10 },
    { id: 'session-bbb', conversationId: 'conv-2', inputTokens: 20 },
  ];
  assert.equal(pickSession({ sessions }, 'conv-2').id, 'session-bbb');
  assert.equal(pickSession({ sessions }, 'session-aaa').id, 'session-aaa');
  // Several ledgers and no id: report the freshest instead of "not connected".
  assert.equal(pickSession({ sessions }, 'unknown-id').id, 'session-aaa');
  assert.equal(pickSession([{ id: 'only', inputTokens: 1 }], '').id, 'only');
  assert.equal(pickSession([], 'x'), null);
});

test('pickSessionDetailed reports how the session was chosen', () => {
  const sessions = [
    { id: 'session-aaa', conversationId: 'conv-1', lastSeen: '2026-11-12T07:00:00.000Z' },
    { id: 'session-bbb', conversationId: 'conv-2', lastSeen: '2026-11-12T09:00:00.000Z' },
  ];
  assert.equal(pickSessionDetailed({ sessions }, 'conv-2').match, 'exact');
  assert.equal(pickSessionDetailed({ sessions }, 'conv-2').session.id, 'session-bbb');
  assert.equal(pickSessionDetailed({ sessions }, '').match, 'fallback');
  assert.equal(pickSessionDetailed({ sessions }, '').session.id, 'session-bbb');
  assert.equal(pickSessionDetailed({ sessions: [] }, 'x').match, 'none');
});

test('normalizeSessionKey bridges DSH ids and billion labels', () => {
  assert.equal(normalizeSessionKey('session-8eafa12c-e877|sub:56b90789'), '8eafa12c-e877');
  assert.equal(normalizeSessionKey('8EAFA12C-E877'), '8eafa12c-e877');
  assert.equal(normalizeSessionKey('session-8eafa12c-e877'), normalizeSessionKey('8eafa12c-e877'));
  assert.equal(normalizeSessionKey(undefined), '');
});

test('pickSession loose match handles the "session-" prefixed billion id', () => {
  const sessions = [{ id: 'session-8eafa12c-e877', inputTokens: 42 }];
  assert.equal(pickSession({ sessions }, '8eafa12c-e877').id, 'session-8eafa12c-e877');
});

test('URL builders', () => {
  assert.equal(sessionsUrl('http://127.0.0.1:18787/'), 'http://127.0.0.1:18787/__bili/sessions');
  // No `embed=1`: that face paints the canvas transparent and hides the top bar.
  assert.equal(
    ledgerUrl('http://127.0.0.1:18787', 'session-8eafa12c', 'dark'),
    'http://127.0.0.1:18787/__bili/?theme=dark#/session/session-8eafa12c',
  );
  assert.equal(ledgerUrl('http://x', null, undefined), 'http://x/__bili/#/sessions');
  assert.equal(SESSIONS_ROUTE, '/__ctx-bili/sessions');
  assert.equal(STATUS_ROUTE, '/__ctx-bili/status');
});
