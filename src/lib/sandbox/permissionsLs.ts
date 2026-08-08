/**
 * Synthetic `ls -l` helper injected into WebContainer labs that seed file modes.
 * WebContainer's virtual FS does not reliably persist Unix modes for the stock
 * `ls`, so labs mount this Node shim + a `.jshrc` alias to `ls`.
 */

export function buildModesJson(modes: Record<string, string>): string {
  const normalized: Record<string, string> = {};
  for (const [rawPath, mode] of Object.entries(modes)) {
    if (typeof mode !== 'string' || !mode.trim()) continue;
    const path = rawPath
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/\/+/g, '/');
    if (!path) continue;
    normalized[path] = mode.trim();
  }
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/** Node script mounted at `.lab/ls.js` and aliased to `ls` via `.jshrc`. */
export const PERMISSIONS_LS_JS = String.raw`#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function loadModes() {
  try {
    const raw = fs.readFileSync(path.join('.lab', 'modes.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function octalToSymbolic(modeStr, isDir) {
  let n = parseInt(String(modeStr), 8);
  if (!Number.isFinite(n)) n = 0o644;
  n = n & 0o777;
  const chars = ['r', 'w', 'x'];
  let out = isDir ? 'd' : '-';
  for (let shift = 6; shift >= 0; shift -= 3) {
    const trip = (n >> shift) & 0o7;
    for (let bit = 0; bit < 3; bit++) {
      out += trip & (1 << (2 - bit)) ? chars[bit] : '-';
    }
  }
  return out;
}

function normalizeRel(p) {
  if (!p || p === '.') return '.';
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function modeFor(modes, relPath, isDir) {
  const key = relPath === '.' ? '' : relPath;
  const direct = key && modes[key];
  if (direct) return octalToSymbolic(direct, isDir);
  return octalToSymbolic(isDir ? '755' : '644', isDir);
}

function listLong(target, modes) {
  const rel = normalizeRel(target);
  let st;
  try {
    st = fs.statSync(rel === '.' ? '.' : rel);
  } catch (err) {
    console.error("ls: cannot access '" + rel + "': No such file or directory");
    process.exitCode = 1;
    return;
  }

  if (!st.isDirectory()) {
    const sym = modeFor(modes, rel, false);
    console.log(sym + '  1 node node ' + String(st.size).padStart(6) + '  ' + path.basename(rel));
    return;
  }

  const entries = fs.readdirSync(rel === '.' ? '.' : rel).sort();
  console.log('total ' + entries.length);
  for (const name of entries) {
    if (name === '.lab' || name === '.jshrc') continue;
    const childRel = rel === '.' ? name : rel + '/' + name;
    let childStat;
    try {
      childStat = fs.statSync(childRel);
    } catch {
      continue;
    }
    const isDir = childStat.isDirectory();
    const sym = modeFor(modes, childRel, isDir);
    const display = isDir ? name + '/' : name;
    console.log(sym + '  1 node node ' + String(childStat.size).padStart(6) + '  ' + display);
  }
}

function listShort(target) {
  const rel = normalizeRel(target);
  let st;
  try {
    st = fs.statSync(rel === '.' ? '.' : rel);
  } catch {
    console.error("ls: cannot access '" + rel + "': No such file or directory");
    process.exitCode = 1;
    return;
  }
  if (!st.isDirectory()) {
    console.log(path.basename(rel));
    return;
  }
  const entries = fs
    .readdirSync(rel === '.' ? '.' : rel)
    .filter((name) => name !== '.lab' && name !== '.jshrc')
    .sort();
  console.log(entries.join('  '));
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const long = args.includes('-l') || args.includes('-la') || args.includes('-al');
const targets = args.filter((a) => !a.startsWith('-'));
const modes = loadModes();
const list = targets.length > 0 ? targets : ['.'];

for (let i = 0; i < list.length; i++) {
  if (list.length > 1) console.log(list[i] + ':');
  if (long) listLong(list[i], modes);
  else listShort(list[i]);
  if (i < list.length - 1) console.log('');
}
`;

export const PERMISSIONS_JSHRC = `# Lab shell hooks — map ls to the mode-aware helper
alias ls='node .lab/ls.js'
`;
