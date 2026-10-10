// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F6: cross-platform compatibility. Unknown data is reported as "unknown", never as "unavailable".
export const TARGETS = { os: ['win', 'mac', 'linux'], arch: ['x64', 'arm64'] };

/** @returns {{status:'ok'|'caution'|'format-swap'|'unavailable'|'unknown', reason:string}} */
export function checkCompat(f, target, entry = null) {
  const { os, arch } = target;
  if (f.kind === 'stock') return { status: 'ok', reason: 'Built into the DAW.' };
  const fmts = entry?.formats?.length ? entry.formats : null;
  const plat = entry?.platforms || {};
  if (plat[os] === false) return { status: 'unavailable', reason: `No ${os === 'win' ? 'Windows' : os === 'mac' ? 'macOS' : 'Linux'} version is listed.` };
  if (f.format === 'AU' && os !== 'mac') {
    if (fmts && !fmts.includes('VST3') && !fmts.includes('CLAP')) return { status: 'unavailable', reason: 'Audio Units only work on macOS and no other format is listed.' };
    return { status: 'format-swap', reason: 'Audio Units only work on macOS; install the VST3 or CLAP version if one exists.' };
  }
  if (f.format === 'AAX') return { status: 'format-swap', reason: 'AAX only loads in Pro Tools; install the VST3/AU version for other DAWs.' };
  if (f.format === 'VST2') return { status: 'caution', reason: 'VST2 is a legacy format; prefer the VST3 build, especially on Apple Silicon.' };
  if (plat.arm === false && arch === 'arm64') return { status: 'caution', reason: 'Only an Intel build is listed; it may need Rosetta or be unsupported.' };
  if (!entry || plat[os] === undefined) return { status: 'unknown', reason: 'No platform data for this plugin yet.' };
  return { status: 'ok', reason: 'Listed as available for this platform.' };
}

export function summarizeCompat(results) {
  const c = { ok: 0, caution: 0, 'format-swap': 0, unavailable: 0, unknown: 0 };
  for (const r of results) c[r.status]++;
  const total = results.length;
  return { ...c, total, ready: c.ok + c.caution, headline: `${c.ok + c.caution}/${total} ready for this system` };
}
