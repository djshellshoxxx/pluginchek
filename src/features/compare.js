// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F9: compare two reports' plugin lists.
import { keyOf } from '../core/merge.js';
import { nameKey } from '../core/schema.js';

export function comparePlugins(a, b) {
  const A = a.filter(f => f.kind !== 'stock'), B = b.filter(f => f.kind !== 'stock');
  const mapB = new Map(B.map(f => [keyOf(f), f])), nameB = new Map(B.map(f => [nameKey(f.name), f]));
  const used = new Set(), out = { added: [], removed: [], changed: [], unchanged: [] };
  for (const fa of A) {
    const fb = mapB.get(keyOf(fa)) || nameB.get(nameKey(fa.name));
    if (!fb || used.has(fb)) { out.removed.push(fa); continue; }
    used.add(fb);
    const diffs = [];
    if (fa.name !== fb.name) diffs.push(`name: ${fa.name} → ${fb.name}`);
    if (fa.format !== fb.format) diffs.push(`format: ${fa.format} → ${fb.format}`);
    if ((fa.vendor || '') !== (fb.vendor || '')) diffs.push(`vendor: ${fa.vendor || '?'} → ${fb.vendor || '?'}`);
    const delta = fb.occurrences - fa.occurrences;
    (diffs.length ? out.changed : out.unchanged).push({ a: fa, b: fb, diffs, delta });
  }
  out.added = B.filter(f => !used.has(f));
  return out;
}

export function compareMarkdown(diff, nameA = 'A', nameB = 'B') {
  const list = (t, xs, fmt) => xs.length ? [`## ${t} (${xs.length})`, ...xs.map(fmt), ''] : [];
  return [`# Plugin comparison: ${nameA} → ${nameB}`, '',
    ...list('Added', diff.added, f => `- ${f.name}${f.vendor ? ` (${f.vendor})` : ''}`),
    ...list('Removed', diff.removed, f => `- ${f.name}${f.vendor ? ` (${f.vendor})` : ''}`),
    ...list('Changed', diff.changed, c => `- ${c.a.name}: ${c.diffs.join('; ')}`),
    `Unchanged: ${diff.unchanged.length}`].join('\n');
}
