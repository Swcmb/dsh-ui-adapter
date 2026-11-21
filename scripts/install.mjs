// dsh-context-bili-bridge  —  profile installer
// Copyright (C) 2026  Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Registers this package as a DSH bundle in one profile:
//   1. creates a directory junction  <profile>/node_modules/dsh-context-bili-bridge
//      pointing at this repository (pnpm's `link:` shape),
//   2. adds the dependency + the `dsh.profile.bundles` entry.
//
// It never edits another plugin's package, never touches dsh-context, and
// leaves billion-context alone (that is scripts/setup.mjs, one key only).
//
//   node scripts/install.mjs --profile <profile-dir>
//   node scripts/install.mjs --profile <dir> --dry-run
//   node scripts/install.mjs --profile <dir> --undo

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PKG = 'dsh-context-bili-bridge';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const profile = path.resolve(value('profile', ''));
if (!value('profile', '')) {
  console.error('[install] --profile <dir> is required (the profile that owns package.json)');
  process.exit(2);
}
const pkgJsonPath = path.join(profile, 'package.json');
if (!fs.existsSync(pkgJsonPath)) {
  console.error(`[install] not a DSH profile (no package.json): ${profile}`);
  process.exit(2);
}

const dryRun = flag('dry-run');
const undo = flag('undo');
const backupPath = `${pkgJsonPath}.bak-before-ctx-bridge`;
const linkPath = path.join(profile, 'node_modules', PKG);
const spec = `link:${repoRoot.replace(/\\/g, '/')}`;

const originalText = fs.readFileSync(pkgJsonPath, 'utf8');
const data = JSON.parse(originalText);
data.dsh ??= {};
data.dsh.profile ??= {};
data.dsh.profile.bundles ??= [];
data.dependencies ??= {};

const bundles = data.dsh.profile.bundles;
const hasDep = Object.prototype.hasOwnProperty.call(data.dependencies, PKG);
const hasBundle = bundles.includes(PKG);

console.log(`[install] profile : ${profile}`);
console.log(`[install] package : ${PKG}`);
console.log(`[install] link    : ${linkPath} -> ${repoRoot}`);
console.log(`[install] dep     : ${hasDep ? data.dependencies[PKG] : '(absent)'}`);
console.log(`[install] bundles : ${hasBundle ? 'listed' : '(absent)'}`);

if (undo) {
  if (hasDep) delete data.dependencies[PKG];
  data.dsh.profile.bundles = bundles.filter((b) => b !== PKG);
  console.log('[install] plan: remove dependency + bundles entry + junction');
  if (!dryRun) {
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, pkgJsonPath);
    else writeJson(pkgJsonPath, data);
    removeLink(linkPath);
  }
  console.log(dryRun ? '[install] dry-run: nothing written' : '[install] reverted');
  process.exit(0);
}

const changed = !hasDep || data.dependencies[PKG] !== spec || !hasBundle;
if (!changed) {
  console.log('[install] already registered, nothing to do');
  process.exit(0);
}

console.log(`[install] plan  : set dependency "${spec}" and append to dsh.profile.bundles`);
if (dryRun) {
  console.log('[install] dry-run: nothing written');
  process.exit(0);
}

if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, originalText, 'utf8');
data.dependencies[PKG] = spec;
if (!hasBundle) data.dsh.profile.bundles = [...bundles, PKG];

fs.mkdirSync(path.join(profile, 'node_modules'), { recursive: true });
removeLink(linkPath);
createLink(linkPath, repoRoot);
writeJson(pkgJsonPath, data);

console.log(`[install] written. backup: ${backupPath}`);
console.log('[install] dsh-hot-installer picks the bundle up on its next manifest poll '
  + '(no restart). Without it, restart DSH once.');

function writeJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function removeLink(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) fs.unlinkSync(target);
    else if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function createLink(target, source) {
  if (process.platform === 'win32') {
    // Junctions need no elevation and match what pnpm creates for `link:` deps.
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `New-Item -ItemType Junction -Path '${target}' -Target '${source}' | Out-Null`,
    ], { stdio: 'pipe' });
    return;
  }
  fs.symlinkSync(source, target, 'dir');
}
