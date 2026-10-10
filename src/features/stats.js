// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F10: usage statistics over many per-project reports.
import { keyOf } from '../core/merge.js';

const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const top = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

/** @param {{name:string, daw:string, plugins:object[]}[]} reports one per project */
export function computeStats(reports) {
  const plugins = new Map(), vendor = new Map(), category = new Map(), format = new Map(), daw = new Map();
  for (const r of reports) {
    bump(daw, r.daw || 'Unknown');
    const seen = new Set();
    for (const f of r.plugins) {
      if (f.kind === 'stock') continue;
      const k = keyOf(f);
      const e = plugins.get(k) || { key: k, name: f.name, vendor: f.vendor, projects: 0, instances: 0 };
      if (!seen.has(k)) { e.projects++; seen.add(k); bump(vendor, f.vendor || 'Unknown'); bump(category, f.category); bump(format, f.format); }
      e.instances += f.occurrences;
      plugins.set(k, e);
    }
  }
  return {
    projects: reports.length,
    plugins: [...plugins.values()].sort((a, b) => b.projects - a.projects || b.instances - a.instances || a.name.localeCompare(b.name)),
    byVendor: top(vendor), byCategory: top(category), byFormat: top(format), byDaw: top(daw),
  };
}

/** Installed inventory items that appear in none of the reports. `matchedPaths` = inventory paths matched by any finding. */
export function unusedInstalled(inventoryPaths, reports) {
  const used = new Set();
  for (const r of reports) for (const f of r.plugins) if (f.installed?.match) used.add(f.installed.match);
  return inventoryPaths.filter(p => !used.has(typeof p === 'string' ? p : p.path));
}

export const statsCsv = s => ['Plugin,Vendor,Projects,Instances', ...s.plugins.map(p => [p.name, p.vendor, p.projects, p.instances].map(v => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = `'${t}`; return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(','))].join('\n');
