// dsh-session-panel — host half (原生 DSH Cordis 插件)
// 会话详情栏：环境 / 上下文 / 会话统计 / Token 用量 / 子智能体。
// 数据来自原生 DSH 服务 sessionQuery / jobs / agents，经本插件折叠后由一个同源只读路由提供给页面。
// token 估算逻辑移植自 dsh-claude-style (MIT, (c) 2026 Nwflower)，见 lib/tokens.mjs。
// Copyright (C) 2026 Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later

import { appendFileSync } from 'node:fs';
import { messageBlockParts, toolSchemaTokens } from './tokens.mjs';

export const name = 'dsh-session-panel';
// 声明 webServer：Cordis 在 apply 前注入，路由可直接读 ctx.webServer。
export const inject = ['webServer'];

const ROUTE = '/__dsh-session-panel';
const KEPT_SESSIONS = 24;
const ANSWER_TTL_MS = 1000;
// 客户端自证日志落盘位置（宿主侧），便于在桌面应用里核对真实运行时状态。
const DIAG_FILE = new URL('../.diag.log', import.meta.url);

// 上下文分项类别与发布顺序。
const KIND_ORDER = ['system', 'tools', 'mcp', 'skills', 'conversation', 'reasoning', 'tool-call', 'tool-result', 'attachment', 'injection'];
const SKILL_CONTENT = '<skill_content';

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function text(v) { return typeof v === 'string' && v !== '' ? v : null; }

function createContextState() {
  return {
    nodes: new Map(),
    sums: { system: 0, skills: 0, conversation: 0, reasoning: 0, 'tool-call': 0, 'tool-result': 0, attachment: 0, injection: 0 },
    tools: 0, mcp: 0,
  };
}

function opensSkill(content) {
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    if (block.type !== 'text' || typeof block.text !== 'string') continue;
    return block.text.startsWith(SKILL_CONTENT);
  }
  return false;
}

// 事件类型 -> 消息来源类别。判定跟 dsh-claude-style 一致：先看块形态（reasoning/tool-call/附件），再看来源归属。
function kindOf(event, message) {
  switch (event.type) {
    case 'system/message': return 'system';
    case 'assistant/message': return 'assistant';
    case 'tool/result': return opensSkill(message.content) ? 'skills' : 'tool-result';
    case 'developer/message': return 'injection';
    case 'user/message': {
      const s = message.source;
      if (s?.kind === 'skill-catalog' || s?.kind === 'skill-invocation') return 'skills';
      if (s?.kind !== undefined && s.kind !== '' && s.kind !== 'user') return 'injection';
      if (s?.form !== undefined) return 'injection';
      return 'conversation';
    }
    default: return null;
  }
}

function contributionsOf(event, message) {
  const source = kindOf(event, message);
  if (source === null) return null;
  const parts = messageBlockParts(message);
  const out = {};
  const add = (kind, tokens) => { if (tokens > 0) out[kind] = (out[kind] ?? 0) + tokens; };
  add('attachment', parts.attachment);
  if (source === 'assistant') {
    add('conversation', parts.text);
    add('tool-call', parts.toolCall);
    add('reasoning', parts.reasoning + parts.other);
  } else {
    add(source, parts.text + parts.reasoning + parts.toolCall + parts.other);
  }
  return out;
}

function retire(state, startSeq, endSeq) {
  for (const [seq, node] of state.nodes) {
    if (seq < startSeq || seq > endSeq) continue;
    for (const kind of Object.keys(node.contributions)) state.sums[kind] -= node.contributions[kind] ?? 0;
    state.nodes.delete(seq);
  }
}

function priceTools(state, tools) {
  let plain = 0, mcp = 0;
  for (const tool of tools) {
    const tokens = toolSchemaTokens(tool);
    const name = tool?.name;
    if (typeof name === 'string' && name.startsWith('mcp__')) mcp += tokens;
    else plain += tokens;
  }
  state.tools = plain;
  state.mcp = mcp;
}

// 增量折叠新到 events 到上下文分项状态。
function foldContext(state, events) {
  for (const event of events) {
    const op = event.surfaceOp;
    if (op !== undefined && op !== 'append') retire(state, op.startSeq, op.endSeq);
    const data = event.data;
    if (event.type === 'request/header') {
      const tools = data?.header?.tools;
      priceTools(state, Array.isArray(tools) ? tools : []);
      continue;
    }
    if (data === undefined || event.seq === undefined) continue;
    const message = data.message ?? data;
    const contributions = contributionsOf(event, message);
    if (contributions === null) continue;
    if (state.nodes.has(event.seq)) retire(state, event.seq, event.seq);
    state.nodes.set(event.seq, { contributions });
    for (const kind of Object.keys(contributions)) state.sums[kind] += contributions[kind] ?? 0;
  }
}

// 用宿主自己的占用读数发布上下文分项。
function publishContext(projections, state) {
  const pressure = projections?.contextPressure;
  const used = pressure?.projectedTokens ?? pressure?.pressureTokens;
  const window = pressure?.contextWindow;
  if (used === undefined || window === undefined || !(window > 0)) return null;
  const counts = {
    system: state.sums.system, tools: state.tools, mcp: state.mcp,
    skills: state.sums.skills, conversation: state.sums.conversation,
    reasoning: state.sums.reasoning, 'tool-call': state.sums['tool-call'],
    'tool-result': state.sums['tool-result'], attachment: state.sums.attachment,
    injection: state.sums.injection,
  };
  const parts = [];
  for (const kind of KIND_ORDER) {
    const tokens = Math.max(0, Math.round(counts[kind]));
    if (tokens > 0) parts.push({ kind, tokens });
  }
  return { used, window, parts };
}

// 会话统计：宿主 projections 的时序与 token 桶。
function statsOf(projections) {
  const stats = projections?.sessionStats;
  const usage = projections?.tokenUsage;
  if (stats === undefined && usage === undefined) return null;
  return {
    turns: num(stats?.turns) ?? 0,
    steps: num(stats?.steps) ?? 0,
    llmMs: num(stats?.llmMs) ?? 0,
    toolMs: num(stats?.toolMs) ?? 0,
    ttftMs: num(stats?.ttftMs) ?? 0,
    ttftSteps: num(stats?.ttftSteps) ?? 0,
    decodeMs: num(stats?.decodeMs) ?? 0,
    decodeTokens: num(stats?.decodeTokens) ?? 0,
    uncachedInputTokens: num(usage?.uncachedInputTokens) ?? 0,
    cacheReadTokens: num(usage?.cacheReadTokens) ?? 0,
    cacheWriteTokens: num(usage?.cacheWriteTokens) ?? 0,
    outputTokens: num(usage?.outputTokens) ?? 0,
  };
}

// 工作目录 / home / 用户：环境一节。
async function environmentOf(directory) {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const home = os.homedir();
  const dir = directory || process.cwd();
  let checkout = null;
  try {
    const result = await Promise.race([
      (async () => {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const run = promisify(execFile);
        const root = (await run('git', ['rev-parse', '--show-toplevel'], { cwd: dir, timeout: 1500 })).stdout.trim();
        let branch = null;
        try { branch = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, timeout: 1500 })).stdout.trim() || null; } catch {}
        let commit = null;
        try { commit = (await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir, timeout: 1500 })).stdout.trim() || null; } catch {}
        let repository = null;
        try {
          const remote = (await run('git', ['remote', 'get-url', 'origin'], { cwd: dir, timeout: 1500 })).stdout.trim();
          const m = remote.match(/^(?:[^@/\s]+@[^:/\s]+:|https?:\/\/[^/]+\/)(.+?)(?:\.git)?\/?$/);
          if (m) { const seg = m[1].split('/').filter(Boolean); if (seg.length >= 2) repository = `${seg[seg.length - 2]}/${seg[seg.length - 1]}`; }
        } catch {}
        if (root) return { root: root.replaceAll('\\', '/'), branch, commit, repository, linked: false };
        return null;
      })(),
      new Promise(r => setTimeout(() => r(null), 2000)),
    ]);
    checkout = result;
  } catch { checkout = null; }
  return { directory: dir.replaceAll('\\', '/'), home: home.replaceAll('\\', '/'), user: os.userInfo?.().username ?? '', checkout };
}

// 子智能体：宿主 subagentCatalog 投影 + agents 服务的运行状态。
async function subagentsOf(projections, agents) {
  const catalog = Array.isArray(projections?.subagentCatalog) ? projections.subagentCatalog : [];
  const rows = [];
  for (const child of catalog) {
    const id = text(child.id);
    if (id === null) continue;
    let running = false;
    try {
      const agent = agents?.get?.(id);
      if (agent) running = agent.status === 'running';
    } catch {}
    rows.push({ id, label: text(child.label) ?? '', running, completed: child?.completed === true });
  }
  return rows;
}

export function apply(ctx) {
  const web = ctx.webServer;
  if (!web || typeof web.register !== 'function') return;

  const entries = new Map();
  const observe = id => {
    const reader = ctx.get('sessionQuery');
    if (typeof reader?.observeSession !== 'function') return Promise.reject(new Error('no sessionQuery'));
    return reader.observeSession(id, { projectionMode: 'all' });
  };
  const release = obs => {
    if (typeof obs?.dispose === 'function') obs.dispose();
    else if (typeof obs?.[Symbol.dispose] === 'function') obs[Symbol.dispose]();
  };

  async function build(sessionId) {
    const obs = await observe(sessionId);
    try {
      const projections = obs.projections?.values ?? {};
      const directory = text(obs.header?.cwd) ?? text(projections.workingDirectory);
      const events = obs.events ?? [];
      const entry = entries.get(sessionId) ?? { context: createContextState(), cursor: -1, at: 0 };
      if (entry.cursor === -1 || events.length > 0) {
        const incoming = entry.cursor === -1 ? events : events.slice(events.findLastIndex(e => (e.seq ?? -1) <= entry.cursor) + 1);
        foldContext(entry.context, incoming);
        const last = incoming[incoming.length - 1];
        if (last !== undefined) entry.cursor = last.seq ?? entry.cursor;
      }
      entries.set(sessionId, entry);
      if (entries.size > KEPT_SESSIONS) {
        const oldest = [...entries.keys()].find(k => k !== sessionId);
        if (oldest) entries.delete(oldest);
      }
      entry.at = Date.now();
      const agents = ctx.get('agents');
      return {
        environment: await environmentOf(directory),
        context: publishContext(projections, entry.context),
        stats: statsOf(projections),
        background: { subagents: await subagentsOf(projections, agents) },
      };
    } finally {
      release(obs);
    }
  }

  const get = async sessionId => {
    const held = entries.get(sessionId);
    if (held && Date.now() - held.at < ANSWER_TTL_MS && held.value) return held.value;
    const value = await build(sessionId);
    const entry = entries.get(sessionId);
    if (entry) entry.value = value;
    return value;
  };

  // 客户端自证通道：client 半把运行时状态 POST 上来，宿主侧落盘。
  // 这样在桌面应用里无需截图、无需浏览器，就能核对真实的注册/渲染状态。
  const DIAG_PATH = `${ROUTE}/diag`;
  web.register({
    kind: 'prefix',
    path: DIAG_PATH,
    handler: (req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const payload = JSON.parse(body || '{}');
          const events = Array.isArray(payload.events) ? payload.events : [];
          for (const event of events) {
            const line = JSON.stringify({ t: Date.now(), ...event });
            try { appendFileSync(DIAG_FILE, line + '\n'); } catch { /* 落盘失败不影响功能 */ }
          }
          res.writeHead(200).end(JSON.stringify({ ok: true, accepted: events.length }));
        } catch (err) {
          res.writeHead(200).end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
        }
      });
    },
  });

  web.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const url = new URL(req.url || '/', 'http://local');
          const id = url.searchParams.get('id');
          if (!id) { res.writeHead(400).end(JSON.stringify({ ok: false, error: 'missing id' })); return; }
          const value = await get(id);
          res.writeHead(200).end(JSON.stringify({ ok: true, value }));
        } catch (err) {
          res.writeHead(200).end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
        }
      });
    },
  });
}
