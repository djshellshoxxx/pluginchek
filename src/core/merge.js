// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

import { nameKey, normalizeFinding } from './schema.js';

const CONF = { low: 1, medium: 2, high: 3 };
export const idKey = f => (f.pluginId ? `${f.pluginId.type}:${f.pluginId.value}` : null);
/** Stable identity used by merge, compare and stats. */
export const keyOf = f => idKey(f) || `n:${nameKey(f.name)}`;

function absorb(into, f) {
  into.occurrences += f.occurrences || 1;
  into.evidence = [...new Set([...into.evidence, ...(f.evidence || [])])].slice(0, 5);
  into.sources = [...new Set([...into.sources, ...(f.sources || [])])];
  into.tracks = [...new Set([...(into.tracks || []), ...(f.tracks || [])])];
  if (CONF[f.confidence] > CONF[into.confidence]) into.confidence = f.confidence;
  if (into.format === 'Unknown' && f.format !== 'Unknown') into.format = f.format;
  if (!into.vendor && f.vendor) into.vendor = f.vendor;
  if (!into.pluginId && f.pluginId) into.pluginId = f.pluginId;
  if (into.category === 'Unknown' && f.category !== 'Unknown') { into.category = f.category; into.explanation = f.explanation; }
}

/**
 * Merge findings. A finding with a pluginId only merges with the same pluginId (or an ID-less
 * finding of the same normalised name); two different IDs never merge, even with the same name.
 */
export function mergeFindings(list) {
  const byId = new Map(), byName = new Map(), loose = new Map();
  for (const raw of list || []) {
    if (!raw?.name) continue;
    const f = normalizeFinding(raw);
    const nk = nameKey(f.name) + '|' + f.kind;
    if (!nameKey(f.name)) continue;
    const ik = idKey(f);
    if (ik) {
      const ex = byId.get(ik);
      if (ex) { absorb(ex, f); continue; }
      const adopt = loose.get(nk); // earlier ID-less duplicate of this plugin: adopt it
      const nf = { ...f };
      if (adopt) { absorb(nf, adopt); loose.delete(nk); }
      byId.set(ik, nf);
      if (!byName.has(nk)) byName.set(nk, nf);
    } else {
      const ex = byName.get(nk) || loose.get(nk);
      if (ex) absorb(ex, f); else loose.set(nk, { ...f });
    }
  }
  return [...byId.values(), ...loose.values()].map(normalizeFinding).sort((a, b) => a.name.localeCompare(b.name));
}
