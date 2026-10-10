// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

import { SNAPSHOT } from '../data/plugins-snapshot.js';
import { CATEGORIES, nameKey, normalizeFinding } from './schema.js';
import { enrichPlugin } from '../../parser-core.js';

const PRICE = ['free', 'freemium', 'paid'];

/** Validate a database object (also used by `npm run db:validate`). Returns a list of problems. */
export function validateDb(db) {
  const errs = [], ids = new Set(), aliases = new Map();
  if (!db || !Array.isArray(db.plugins)) return ['plugins array missing'];
  for (const p of db.plugins) {
    if (!p.id || !p.name) errs.push(`entry missing id/name: ${JSON.stringify(p).slice(0, 60)}`);
    if (ids.has(p.id)) errs.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (!CATEGORIES.includes(p.category)) errs.push(`${p.id}: unknown category ${p.category}`);
    if (p.price && !PRICE.includes(p.price)) errs.push(`${p.id}: bad price ${p.price}`);
    for (const l of p.links || []) if (!/^https:\/\//i.test(l.url || '')) errs.push(`${p.id}: non-https link`);
    for (const a of [p.name, ...(p.aliases || [])]) {
      const k = nameKey(a), prev = aliases.get(k);
      if (prev && prev !== p.id) errs.push(`alias collision "${a}" between ${prev} and ${p.id}`);
      aliases.set(k, p.id);
    }
  }
  for (const p of db.plugins) for (const a of p.alternatives || []) if (!ids.has(a)) errs.push(`${p.id}: unknown alternative ${a}`);
  return errs;
}

export function createDb(snapshot = SNAPSHOT) {
  const errs = validateDb(snapshot);
  if (errs.length) throw new Error(`Invalid plugin database: ${errs[0]}`);
  const byId = new Map(snapshot.plugins.map(p => [p.id, p]));
  const aliasMap = new Map(), idMap = new Map();
  for (const p of snapshot.plugins) {
    for (const a of [p.name, `${p.vendor} ${p.name}`, ...(p.aliases || [])]) aliasMap.set(nameKey(a), p);
    for (const i of p.ids || []) idMap.set(`${i.type}:${i.value}`, p);
  }
  const lookup = f => {
    if (f.pluginId) { const e = idMap.get(`${f.pluginId.type}:${f.pluginId.value}`); if (e) return { entry: e, via: 'id' }; }
    const nk = nameKey(f.name), vk = nameKey(f.vendor);
    const cands = [nk, vk && nk.startsWith(vk) ? nk.slice(vk.length) : null, vk ? vk + nk : null];
    for (const k of cands) if (k && aliasMap.has(k)) return { entry: aliasMap.get(k), via: 'name' };
    return null;
  };
  const aliasKeys = entry => new Set([entry.name, `${entry.vendor} ${entry.name}`, ...(entry.aliases || [])].map(nameKey));
  const get = id => byId.get(id) || null;
  /** Enrich in place-safe fashion: returns a new normalised finding. A parsed vendor is never overwritten. */
  const enrich = f => {
    const hit = f.kind === 'stock' ? null : lookup(f);
    if (hit) {
      const e = hit.entry;
      return normalizeFinding({ ...f, vendor: f.vendor || e.vendor, category: e.category, explanation: e.summary, dbId: e.id, price: e.price || null });
    }
    if (f.category !== 'Unknown' && f.explanation) return normalizeFinding(f);
    const g = enrichPlugin(f.name, f.vendor);
    return normalizeFinding({ ...f, vendor: f.vendor || (g.vendor === 'Unknown' ? '' : g.vendor), category: f.category !== 'Unknown' ? f.category : g.category, explanation: f.explanation || g.explanation });
  };
  return { lookup, enrich, get, aliasKeys, size: snapshot.plugins.length, version: snapshot.version };
}

export const defaultDb = createDb();
