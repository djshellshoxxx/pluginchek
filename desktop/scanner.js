// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Installed-plugin scanner (F4). Reads directory listings and tiny metadata files only; never loads plugin binaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const EXT = { '.vst3': 'VST3', '.clap': 'CLAP', '.vst': 'VST2', '.dll': 'VST2', '.component': 'AU', '.aaxplugin': 'AAX' };
const PROJECT_EXT = new Set(['.als', '.rpp', '.rpp-bak', '.flp', '.song', '.bwproject', '.cpr', '.npr', '.ptx', '.pts', '.logicx', '.band', '.reason']);

export function defaultRoots(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    const pf = env['ProgramFiles'] || 'C:\\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    return [path.join(pf, 'Common Files', 'VST3'), path.join(pf, 'Common Files', 'CLAP'), path.join(pf, 'VSTPlugIns'), path.join(pf, 'Steinberg', 'VSTPlugins'), path.join(pf86, 'VSTPlugins'), path.join(la, 'Programs', 'Common', 'VST3'), path.join(la, 'Programs', 'Common', 'CLAP')];
  }
  if (platform === 'darwin') {
    const lib = ['/Library', path.join(home, 'Library')];
    return lib.flatMap(l => ['VST', 'VST3', 'Components', 'CLAP'].map(d => path.join(l, 'Audio', 'Plug-Ins', d)));
  }
  return [path.join(home, '.vst3'), '/usr/lib/vst3', '/usr/local/lib/vst3', path.join(home, '.clap'), '/usr/lib/clap', '/usr/local/lib/clap', path.join(home, '.vst'), '/usr/lib/lxvst', '/usr/lib/vst'];
}

/** VST3 bundles may ship Contents/moduleinfo.json with the class IDs. Best effort (VERIFY against real bundles). */
async function readModuleInfo(dir) {
  try {
    const raw = await fs.readFile(path.join(dir, 'Contents', 'moduleinfo.json'), { encoding: 'utf8', flag: 'r' });
    if (raw.length > 1_000_000) return {};
    const j = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const ids = (j.Classes || []).filter(c => c['Category'] === 'Audio Module Class' && /^[0-9A-Fa-f]{32}$/.test(c['CID'] || '')).map(c => ({ type: 'vst3-cid', value: c['CID'].toUpperCase() }));
    return { vendor: j['Factory Info']?.Vendor || '', ids, name: j.Name || '' };
  } catch { return {}; }
}

/**
 * @param {string[]} roots
 * @param {{maxDepth?:number,maxEntries?:number,signal?:{aborted:boolean},fsx?:object}} opts fsx allows tests to inject a virtual fs
 */
export async function scanPlugins(roots, { maxDepth = 4, maxEntries = 50_000, signal, fsx = fs } = {}) {
  const items = [], notes = [], seen = new Set();
  let count = 0;
  async function walk(dir, depth) {
    if (signal?.aborted || count >= maxEntries) return;
    let real;
    try { real = await fsx.realpath(dir); } catch { return; }
    if (seen.has(real)) return; // symlink loop / duplicate root
    seen.add(real);
    let ents;
    try { ents = await fsx.readdir(dir, { withFileTypes: true }); }
    catch (e) { notes.push(`Skipped ${dir}: ${e.code || e.message}`); return; }
    for (const e of ents) {
      if (signal?.aborted || ++count > maxEntries) return;
      const full = path.join(dir, e.name), ext = path.extname(e.name).toLowerCase();
      const fmt = EXT[ext];
      if (fmt && (e.isFile() || e.isDirectory() || e.isSymbolicLink())) {
        const item = { path: full, name: path.basename(e.name, ext), format: fmt, ids: [] };
        if (ext === '.vst3' && e.isDirectory()) { const mi = await readModuleInfo(full); if (mi.ids) item.ids = mi.ids; if (mi.vendor) item.vendor = mi.vendor; }
        items.push(item);
      } else if (e.isDirectory() && depth < maxDepth) await walk(full, depth + 1);
    }
  }
  for (const r of roots) await walk(r, 0);
  return { items, notes: [...new Set(notes)], truncated: count >= maxEntries };
}

export async function listProjects(dir, { maxDepth = 8, maxFiles = 20_000, fsx = fs } = {}) {
  const out = [];
  async function walk(d, depth) {
    if (depth > maxDepth || out.length >= maxFiles) return;
    let ents;
    try { ents = await fsx.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(backup|\.git|node_modules)$/i.test(e.name) && !e.name.toLowerCase().endsWith('.logicx')) await walk(full, depth + 1); else if (e.name.toLowerCase().endsWith('.logicx')) out.push({ path: full, size: 0, package: true }); }
      else if (e.isFile() && PROJECT_EXT.has(path.extname(e.name).toLowerCase())) {
        try { out.push({ path: full, size: (await fsx.stat(full)).size }); } catch { /* vanished */ }
      }
      if (out.length >= maxFiles) return;
    }
  }
  await walk(dir, 0);
  return out;
}
