// dsh-context-bili-bridge  —  one-shot, explicit config edit
// Copyright (C) 2026  Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file only runs when you invoke it. It writes ONE key into
// billion-context's own config: dsh.contextTab = false. That removes
// billion-context's duplicate "上下文" tab. It does NOT disable compaction,
// the settings page, the Web UI, or the /acp command (billion-context
// CONFIGURATION.zh-CN.md:126).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const configPath = process.env.BILI_CONFIG_FILE
  || path.join(os.homedir(), '.config', 'billion-context', 'billion-context.json');
const backupPath = `${configPath}.bak-before-ctx-bridge`;
const undo = process.argv.includes('--undo');
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(`[bridge] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  fail(`config not found: ${configPath}\nSet BILI_CONFIG_FILE if billion-context uses another path.`);
}

const original = fs.readFileSync(configPath, 'utf8');
let data;
try {
  data = JSON.parse(original);
} catch (err) {
  fail(`cannot parse ${configPath}: ${err.message}`);
}
if (!data || typeof data !== 'object' || Array.isArray(data)) fail('config root is not an object');

if (undo) {
  if (!fs.existsSync(backupPath)) fail(`no backup to restore: ${backupPath}`);
  const restored = fs.readFileSync(backupPath, 'utf8');
  console.log(`[bridge] would restore ${configPath} from ${backupPath}`);
  if (!dryRun) fs.writeFileSync(configPath, restored, 'utf8');
  console.log(dryRun ? '[bridge] dry-run: nothing written' : '[bridge] restored');
  process.exit(0);
}

const before = data.dsh && typeof data.dsh === 'object' ? { ...data.dsh } : {};
const after = { ...before, contextTab: false };
const changed = JSON.stringify(before) !== JSON.stringify(after);

console.log(`[bridge] target : ${configPath}`);
console.log(`[bridge] change : dsh ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
console.log(`[bridge] backup : ${backupPath}`);
if (!changed) {
  console.log('[bridge] already set, nothing to do');
  process.exit(0);
}
if (dryRun) {
  console.log('[bridge] dry-run: nothing written');
  process.exit(0);
}

if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
data.dsh = after;
const next = `${JSON.stringify(data, null, 2)}\n`;
fs.writeFileSync(configPath, next, 'utf8');
console.log('[bridge] written. Reload the DSH page (or restart DSH) for the tab to disappear.');
