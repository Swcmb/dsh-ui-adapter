// SPDX-License-Identifier: GPL-3.0-or-later
// Tests import the host half outside DSH; keep its diagnostic writer quiet so
// test runs do not pollute the real .host.log.
process.env.DSH_CTX_BILI_BRIDGE_LOG = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

import { readOriginFile, resolveOrigin, registerRoutes, stateDir } from '../lib/proxy.mjs';
import { SESSIONS_ROUTE, STATUS_ROUTE, DIAG_ROUTE } from '../lib/ledger.mjs';

const LEDGER = { sessions: [{ id: 'session-abc', inputTokens: 10, cachedTokens: 0, outputTokens: 1 }] };

function tmpOriginFile(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-bili-'));
  const file = path.join(dir, 'proxy-origin');
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
}

test('readOriginFile accepts billion proxy-origin JSON and normalizes the URL', () => {
  const file = tmpOriginFile({ origin: 'http://127.0.0.1:18787/', pid: process.pid, lane: 'dsh' });
  const info = readOriginFile(file);
  assert.equal(info.origin, 'http://127.0.0.1:18787');
  assert.equal(info.pid, process.pid);
  assert.equal(info.lane, 'dsh');
});

test('readOriginFile rejects junk instead of throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-bili-'));
  const bad = path.join(dir, 'proxy-origin');
  fs.writeFileSync(bad, '{"origin":"not-a-url"}', 'utf8');
  assert.equal(readOriginFile(bad), null);
  assert.equal(readOriginFile(path.join(dir, 'missing')), null);
});

test('stateDir follows XDG_STATE_HOME when set', () => {
  const original = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = path.join(os.tmpdir(), 'xdg-test');
  try {
    assert.equal(stateDir(), path.join(os.tmpdir(), 'xdg-test', 'billion-context'));
  } finally {
    if (original === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = original;
  }
});

test('resolveOrigin falls back to config when the instance file is missing', () => {
  const original = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = path.join(os.tmpdir(), 'definitely-missing-state-dir');
  try {
    const info = resolveOrigin('http://127.0.0.1:19999', { force: true });
    assert.equal(info.origin, 'http://127.0.0.1:19999');
    assert.equal(info.source, 'config');
  } finally {
    if (original === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = original;
  }
});

/** Boot a stand-in for billion's admin server. */
function fakeBillion(payload) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/__bili/sessions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }
      res.writeHead(404);
      res.end('{}');
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function fakeWebServer() {
  const routes = [];
  return {
    routes,
    register(route) {
      routes.push(route);
      return () => { routes.splice(routes.indexOf(route), 1); };
    },
  };
}

function invoke(handler) {
  return new Promise((resolve) => {
    const chunks = [];
    const res = {
      status: 0,
      headers: {},
      writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; },
      end(body) { chunks.push(body ?? ''); resolve({ status: this.status, body: JSON.parse(chunks.join('') || '{}') }); },
    };
    handler({ method: 'GET', headers: {}, url: '/' }, res);
  });
}

test('host proxy serves the ledger on a same-origin route', async () => {
  const { server, port } = await fakeBillion(LEDGER);
  const original = process.env.XDG_STATE_HOME;
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-bili-xdg-'));
  fs.mkdirSync(path.join(xdg, 'billion-context'), { recursive: true });
  fs.writeFileSync(
    path.join(xdg, 'billion-context', 'proxy-origin'),
    JSON.stringify({ origin: `http://127.0.0.1:${port}`, pid: process.pid }),
    'utf8',
  );
  process.env.XDG_STATE_HOME = xdg;
  try {
    const ws = fakeWebServer();
    const dispose = registerRoutes(ws, () => 'http://127.0.0.1:1');
    assert.deepEqual(ws.routes.map((r) => r.path), [SESSIONS_ROUTE, STATUS_ROUTE, DIAG_ROUTE]);

    const sessions = ws.routes.find((r) => r.path === SESSIONS_ROUTE);
    const answer = await invoke(sessions.handler);
    assert.equal(answer.status, 200);
    assert.equal(answer.body.sessions[0].id, 'session-abc');

    const status = ws.routes.find((r) => r.path === STATUS_ROUTE);
    const info = await invoke(status.handler);
    assert.equal(info.body.live, true);
    assert.equal(info.body.origin, `http://127.0.0.1:${port}`);

    // The diag route accepts a POSTed JSON body and answers 204 without
    // needing the upstream at all.
    const diag = ws.routes.find((r) => r.path === DIAG_ROUTE);
    const diagAnswer = await new Promise((resolve) => {
      const chunks = [];
      const res = {
        status: 0,
        writeHead(code) { this.status = code; },
        end() { resolve({ status: this.status }); },
      };
      const req = {
        method: 'POST',
        on(event, fn) {
          if (event === 'data') fn(Buffer.from('{"via":"runtime-inject","sessions":"ok"}'));
          if (event === 'end') fn();
          return this;
        },
      };
      diag.handler(req, res);
    });
    assert.equal(diagAnswer.status, 204);

    dispose();
    assert.equal(ws.routes.length, 0, 'disposer unregisters both routes');
  } finally {
    server.close();
    if (original === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = original;
  }
});

test('host proxy reports 502 when the upstream is dead, not a fake success', async () => {
  const original = process.env.XDG_STATE_HOME;
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-bili-xdg-'));
  fs.mkdirSync(path.join(xdg, 'billion-context'), { recursive: true });
  fs.writeFileSync(
    path.join(xdg, 'billion-context', 'proxy-origin'),
    JSON.stringify({ origin: 'http://127.0.0.1:1', pid: process.pid }),
    'utf8',
  );
  process.env.XDG_STATE_HOME = xdg;
  try {
    const ws = fakeWebServer();
    registerRoutes(ws, () => 'http://127.0.0.1:1');
    const sessions = ws.routes.find((r) => r.path === SESSIONS_ROUTE);
    const answer = await invoke(sessions.handler);
    assert.equal(answer.status, 502);
    assert.ok(answer.body.error.message);
  } finally {
    if (original === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = original;
  }
});

test('registerRoutes is inert without a web server', () => {
  assert.equal(typeof registerRoutes(undefined, () => 'x'), 'function');
  assert.equal(typeof registerRoutes({}, () => 'x'), 'function');
});
