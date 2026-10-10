// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Missing-media detection (F2). Pure: resolves MediaRef entries against a list of available relative paths.
const norm = p => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
const base = p => norm(p).split('/').pop();

/**
 * @param {object[]} media MediaRef[]
 * @param {string[]} available relative paths from a chosen project folder (first segment = folder name)
 */
export function resolveMedia(media, available) {
  if (!available?.length) return media.map(m => ({ ...m, status: 'unchecked', resolvedPath: null }));
  const byRel = new Map(), byBase = new Map();
  for (const p of available) {
    const parts = norm(p).split('/');
    byRel.set(parts.slice(1).join('/'), p);
    byRel.set(parts.join('/'), p);
    const b = parts[parts.length - 1];
    if (!byBase.has(b)) byBase.set(b, p);
  }
  return media.map(m => {
    const rel = norm(m.relPath).replace(/^(\.\.\/)+/, '');
    if (rel && byRel.has(rel)) return { ...m, status: 'present', resolvedPath: byRel.get(rel) };
    const hit = byBase.get(base(m.path));
    if (hit) return { ...m, status: 'possible', resolvedPath: hit };
    return { ...m, status: 'missing', resolvedPath: null };
  });
}

/** Absolute candidate paths for desktop existence checks (project directory + relative path). */
export function candidatePaths(media, projectDir) {
  const join = (d, r) => `${d.replace(/[\\/]+$/, '')}/${r.replace(/^[\\/]+/, '')}`;
  return media.map(m => m.absPath || (projectDir && m.relPath ? join(projectDir, m.relPath) : ''));
}

export function summarizeMedia(media) {
  const c = { total: media.length, present: 0, possible: 0, missing: 0, unchecked: 0 };
  for (const m of media) c[m.status] = (c[m.status] || 0) + 1;
  return c;
}

const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const makeMediaCsv = media => ['Path,Kind,Status,Source,Occurrences', ...media.map(m => [m.path, m.kind, m.status, m.source, m.occurrences].map(cell).join(','))].join('\n');
