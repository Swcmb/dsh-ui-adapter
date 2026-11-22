// dsh-ui-adapter — opencode-style tool aliases (host half)
// Copyright (C) 2026  Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Why this exists
// ---------------
// Models routed through opencode2api keep emitting OpenCode-shaped tool calls
// (`read`, `glob`, `grep`, `bash`, `ls`). This DSH build has no such tools: the
// file surface is the `ops_*` family published by dsh-ops into each agent's own
// layer. Those calls therefore die as `unknown tool "read"` inside DSH's tool
// pipeline — before anything executes and with no relation to billion-context,
// so `compress.absorb` can stay enabled.
//
// The alias layer registers the familiar names and *delegates* to the real
// `ops_*` definition. DSH keeps owning argument validation, sandboxing,
// approval and presentation: nothing is re-implemented and no policy is
// bypassed.
//
// Two registration layers:
//   - the agent's own layer (`agent.ctx.plugin`), where the `ops_*` targets
//     live, so lookup and delegation happen in one scope; this is also the only
//     layer a host-side `tools.restrict({deny})` cannot mask;
//   - the global layer, as a fallback for callers without an agent.
// The first layer that resolves the target wins; duplicates inside one layer
// are skipped.

import { log } from './hostlog.mjs';

/** Alias name -> real tool name (public dsh-ops name). */
const TARGETS = {
  read: 'ops_inspect_local_file',
  glob: 'ops_glob',
  grep: 'ops_grep',
  bash: 'ops_bash',
  ls: 'ops_glob',
  list: 'ops_glob',
};

const str = (value) => (typeof value === 'string' && value.length > 0 ? value : undefined);
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

function textOf(value) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Translate an opencode-shaped call into the real tool's argument object.
 * Unknown fields are dropped on purpose: the real tools validate strictly.
 */
function mapArgs(alias, args = {}) {
  const path = str(args.filePath) ?? str(args.file_path) ?? str(args.path);
  switch (alias) {
    case 'read':
      return {
        path: path ?? '.',
        offset: Math.max(1, num(args.offset) ?? 1),
        limit: Math.min(10000, Math.max(1, num(args.limit) ?? 400)),
      };
    case 'glob': {
      const pattern = str(args.pattern) ?? '**/*';
      return { path: path ?? '.', pattern: [pattern], kind: 'file' };
    }
    case 'grep': {
      const include = str(args.include);
      const out = {
        path: path ?? '.',
        pattern: str(args.pattern) ?? '',
        outputMode: 'content',
      };
      if (include) out.glob = [include];
      return out;
    }
    case 'bash': {
      const command = str(args.command) ?? str(args.cmd) ?? '';
      const out = {
        command,
        description: str(args.description) ?? `run: ${command.trim().slice(0, 60) || 'shell command'}`,
      };
      const workdir = str(args.workdir) ?? str(args.cwd);
      if (workdir) out.workdir = workdir;
      const timeout = num(args.timeoutMs) ?? num(args.timeout);
      if (timeout !== undefined) out.timeoutMs = timeout <= 1000 ? timeout * 1000 : timeout;
      return out;
    }
    case 'ls':
    case 'list':
      return { path: path ?? '.', pattern: ['*'], kind: 'all', sort: 'path', limit: num(args.limit) ?? 200 };
    default:
      return args;
  }
}

/** Model-facing parameter schema per alias (JSON Schema). */
const PARAMETERS = {
  read: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'File to read. Absolute, or relative to the session workspace.' },
      path: { type: 'string', description: 'Alias of filePath.' },
      offset: { type: 'integer', description: '1-based first line to read; default 1.' },
      limit: { type: 'integer', description: 'Maximum lines to read; default 400.' },
    },
  },
  glob: {
    type: 'object',
    required: ['pattern'],
    properties: {
      pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts" or "src/*.md".' },
      path: { type: 'string', description: 'Search root; default the session workspace.' },
    },
  },
  grep: {
    type: 'object',
    required: ['pattern'],
    properties: {
      pattern: { type: 'string', description: 'Rust-style regular expression, e.g. "TODO|FIXME".' },
      path: { type: 'string', description: 'Search root; default the session workspace.' },
      include: { type: 'string', description: 'Only search files matching this relative glob, e.g. "**/*.ts".' },
    },
  },
  bash: {
    type: 'object',
    required: ['command'],
    properties: {
      command: { type: 'string', description: 'Bash command or pipeline. Shell state does not persist.' },
      description: { type: 'string', description: 'Short active-voice description, 5–10 words.' },
      workdir: { type: 'string', description: 'Working directory, relative to the session workspace.' },
      timeout: { type: 'integer', description: 'Timeout in milliseconds; default 120000.' },
    },
  },
  ls: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory to list; default the session workspace.' },
    },
  },
  list: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory to list; default the session workspace.' },
    },
  },
};

const DESCRIPTIONS = {
  read: 'Read a UTF-8 text file and return numbered lines.',
  glob: 'Find files by glob pattern below a path.',
  grep: 'Search file contents with a regular expression.',
  bash: 'Execute a Bash command in the session workspace.',
  ls: 'List directory entries with byte sizes.',
  list: 'List directory entries with byte sizes.',
};

/** Resolve the delegation target inside one tools view. */
function resolveTarget(tools, target, agent, toolSet) {
  try {
    const direct = tools.get(target, agent, toolSet);
    if (direct !== undefined) return direct;
  } catch {
    /* fall through to executable() */
  }
  try {
    return tools.executable?.(target, agent, toolSet);
  } catch {
    return undefined;
  }
}

function makeDefinition(tools, alias, fallbackAgent) {
  const target = TARGETS[alias];
  return {
    name: alias,
    description: DESCRIPTIONS[alias],
    parameters: PARAMETERS[alias],
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: textOf(value) }],
    },
    async execute(args, exec) {
      const agent = exec?.agent ?? fallbackAgent;
      const definition = resolveTarget(tools, target, agent, exec?.toolSet);
      if (!definition || typeof definition.execute !== 'function') {
        throw new Error(
          `${alias}: "${target}" is not available in this session, so the alias cannot delegate. ` +
            `Call "${target}" directly, or use another file tool from your tool list.`
        );
      }
      return await definition.execute(mapArgs(alias, args), exec);
    },
  };
}

/** Register every alias into one tools view; returns the names that landed. */
function registerInto(tools, agent, sink) {
  const added = [];
  for (const alias of Object.keys(TARGETS)) {
    try {
      tools.register(makeDefinition(tools, alias, agent));
      added.push(alias);
    } catch (err) {
      sink.push({ alias, error: String(err?.message ?? err) });
    }
  }
  return added;
}

/**
 * Register the alias tools.
 *
 * @param {object} ctx plugin context (Cordis)
 */
export function registerToolAliases(ctx) {
  const fibers = new Map();
  const dryRun = process.env.DSH_UA_ALIAS_DRY === '1';

  // Layer 1 — the agent's own scope: same scope as the ops_* targets, and
  // immune to a host-side restrict() that only masks inherited names.
  try {
    ctx.on('agent/created', ({ agent } = {}) => {
      if (!agent?.ctx || fibers.has(agent)) return;
      try {
        const fiber = agent.ctx.plugin((child) => {
          child.inject(['tools'], (toolsCtx) => {
            const tools = toolsCtx.tools;
            if (!tools || typeof tools.register !== 'function') return;
            const failures = [];
            const added = dryRun ? [] : registerInto(tools, agent, failures);
            const resolved = Object.keys(TARGETS).map((alias) => ({
              alias,
              target: TARGETS[alias],
              ok: resolveTarget(tools, TARGETS[alias], agent) !== undefined,
            }));
            const native = ['read', 'glob', 'grep', 'bash', 'ls'].map((name) => ({
              name,
              present: (() => {
                try {
                  return tools.get(name, agent) !== undefined;
                } catch {
                  return 'throw';
                }
              })(),
            }));
            log('alias:agent-registered', {
              dryRun,
              preset: (() => {
                try {
                  const p = agent?.preset ?? agent?.presetId ?? agent?.agentPreset ?? agent?.options?.preset;
                  return typeof p === 'string' ? p : p?.id ?? null;
                } catch {
                  return null;
                }
              })(),
              agentKeys: (() => {
                try {
                  return Object.keys(agent).filter((k) => /preset|mode|id|name|profile/i.test(k)).slice(0, 8);
                } catch {
                  return null;
                }
              })(),
              count: added.length,
              added,
              failures,
              resolved,
              native,
            });
          });
        });
        if (fiber && typeof fiber.catch === 'function') fiber.catch(() => {});
        fibers.set(agent, fiber);
      } catch (err) {
        log('alias:agent-attach-failed', String(err?.message ?? err));
      }
    });
  } catch (err) {
    log('alias:agent-hook-failed', String(err?.message ?? err));
  }

  try {
    ctx.on('agent/disposed', ({ agent } = {}) => {
      const fiber = fibers.get(agent);
      fibers.delete(agent);
      try {
        const pending = fiber?.dispose?.();
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      } catch {
        /* disposal is best effort */
      }
    });
  } catch (err) {
    log('alias:agent-dispose-hook-failed', String(err?.message ?? err));
  }

  // Layer 2 — global fallback for callers without an agent.
  try {
    ctx.inject(['tools'], (toolsCtx) => {
      const tools = toolsCtx.tools;
      if (!tools || typeof tools.register !== 'function') {
        log('alias:no-tools-service');
        return;
      }
      const failures = [];
      const added = dryRun ? [] : registerInto(tools, undefined, failures);
      log('alias:registered', { dryRun, count: added.length, added, failures });
    });
  } catch (err) {
    log('alias:inject-throws', String(err?.message ?? err));
  }
}
