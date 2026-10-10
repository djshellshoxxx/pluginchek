// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Installed-plugin matching (pure; shared by the web folder picker and the desktop scanner).
import { normalizeName } from '../../parser-core.js';
import { nameKey, normalizeFinding, setInstalled } from './schema.js';
import { idKey } from './merge.js';

const STOP = new Set(['vst', 'vst3', 'x64', 'x86', '64', 'bit', 'au', 'aax', 'clap', 'plugin', 'the']);
const baseName = p => String(p).split(/[\\/]/).filter(Boolean).pop() || '';
const tokens = s => {
  const all = String(s).toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t));
  const words = all.filter(t => !/^\d+$/.test(t)); // version numbers differ between installs; ignore them for fuzzy matching
  return new Set(words.length ? words : all);
};

export function toInventoryItems(list) {
  return (list || []).map(x => {
    const o = typeof x === 'string' ? { path: x } : { ...x };
    const raw = o.name || baseName(o.path);
    o.name = normalizeName(raw);
    o.key = nameKey(o.name);
    o.tok = tokens(o.name);
    o.ids = new Set((o.ids || []).map(i => `${i.type}:${i.value}`));
    return o;
  }).filter(i => i.key);
}

const jaccard = (a, b) => { let n = 0; for (const t of a) if (b.has(t)) n++; return a.size + b.size - n ? n / (a.size + b.size - n) : 0; };

export function matchInventory(findings, inventory, { db = null } = {}) {
  const items = toInventoryItems(inventory);
  const byKey = new Map(), byId = new Map(), byTok = new Map();
  for (const it of items) {
    if (!byKey.has(it.key)) byKey.set(it.key, it);
    for (const i of it.ids) if (!byId.has(i)) byId.set(i, it);
    for (const t of it.tok) { if (!byTok.has(t)) byTok.set(t, []); byTok.get(t).push(it); }
  }
  return (findings || []).map(src => {
    const f = normalizeFinding({ ...src });
    if (f.kind === 'stock') return f;
    if (!items.length) return setInstalled(f, 'unknown');
    const ik = idKey(f);
    if (ik && byId.has(ik)) return setInstalled(f, 'matched', byId.get(ik).path, 'id');
    const nk = nameKey(normalizeName(f.name)), vk = nameKey(f.vendor);
    const keys = new Set([nk, vk + nk]);
    if (vk && nk.startsWith(vk)) keys.add(nk.slice(vk.length));
    if (f.dbId && db) for (const k of db.aliasKeys(db.get(f.dbId))) keys.add(k);
    for (const k of keys) if (k && byKey.has(k)) return setInstalled(f, 'matched', byKey.get(k).path, 'name');
    const ft = tokens(f.name);
    let best = null, bs = 0;
    const seen = new Set();
    for (const t of ft) for (const it of byTok.get(t) || []) {
      if (seen.has(it)) continue;
      seen.add(it);
      const s = jaccard(ft, it.tok);
      if (s > bs) { bs = s; best = it; }
    }
    if (best && bs >= 0.8) return setInstalled(f, 'possible', best.path, 'fuzzy');
    return setInstalled(f, 'missing');
  });
}

/**
 * Turn webkitdirectory file paths into plugin entries. Folder pickers list files only, so bundles
 * (Foo.vst3/Contents/..., Foo.component/..., Foo.clap) are detected by their directory segment and de-duplicated.
 */
export function pluginPathsFromFiles(paths) {
  const out = new Set();
  for (const raw of paths) {
    const p = String(raw).replace(/\\/g, '/');
    const bundle = /^(.*?\.(?:vst3|component|clap|aaxplugin|vst))(?:\/|$)/i.exec(p);
    if (bundle) out.add(bundle[1]);
    else if (/\.(dll|so|clap|vst3)$/i.test(p)) out.add(p);
  }
  return [...out];
}
