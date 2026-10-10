// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Report schema v2 (see docs/roadmap/01-feature-specs.md).
export const SCHEMA_VERSION = 2;
export const FORMATS = ['VST2', 'VST3', 'AU', 'AAX', 'CLAP', 'Unknown'];
export const CONFIDENCE = ['high', 'medium', 'low'];
export const CATEGORIES = ['EQ', 'Compressor', 'Limiter', 'Reverb', 'Delay', 'Distortion / Saturation', 'Instrument / Synth', 'Sampler / Instrument', 'Drum Instrument', 'Amp / Guitar', 'Pitch / Time', 'Pitch / Voice', 'Modulation', 'Mixing / Utility', 'Analyzer', 'Dynamics', 'Instrument / Effect', 'Instrument', 'Effect', 'Utility', 'Unknown'];

export const nameKey = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function formatLabel(f) {
  if (f === 'VST2 / VST' || f === 'VST') return 'VST2';
  if (f === 'VST / VST3') return 'VST3';
  return FORMATS.includes(f) ? f : 'Unknown';
}

const LEGACY_STATUS = { matched: 'matched', 'possible match': 'possible', 'not found': 'missing', 'inventory not supplied': 'unknown' };
const STATUS_LEGACY = { matched: 'matched', possible: 'possible match', missing: 'not found', unknown: 'inventory not supplied' };

export function setInstalled(f, status, match = null, via = null) {
  f.installed = { status, match, via };
  f.installedStatus = STATUS_LEGACY[status] || 'inventory not supplied';
  if (match) f.inventoryMatch = match; else delete f.inventoryMatch;
  return f;
}

/** Fill defaults so every finding has the full v2 shape. */
export function normalizeFinding(p) {
  const f = {
    id: '', name: '', vendor: '', format: 'Unknown', pluginId: null, kind: 'plugin', category: 'Unknown', explanation: '',
    confidence: 'medium', evidence: [], sources: [], tracks: [], occurrences: 1, daw: 'Unknown', dbId: null, price: null,
    ...p,
  };
  f.format = formatLabel(f.format);
  f.vendor = f.vendor && f.vendor !== 'Unknown' ? f.vendor : '';
  f.evidence = [...new Set(f.evidence || [])].slice(0, 5);
  f.sources = [...new Set(f.sources || [])];
  f.tracks = [...new Set(f.tracks || [])];
  const st = p.installed?.status || LEGACY_STATUS[p.installedStatus] || 'unknown';
  setInstalled(f, st, p.installed?.match ?? p.inventoryMatch ?? null, p.installed?.via ?? null);
  f.id = fnv(f.pluginId ? `${f.pluginId.type}:${f.pluginId.value}` : `${nameKey(f.name)}|${nameKey(f.vendor)}`);
  return f;
}

export function validateFinding(f) {
  const errs = [];
  if (!f || typeof f !== 'object') throw new Error('finding must be an object');
  if (!f.name || typeof f.name !== 'string') errs.push('name');
  if (!FORMATS.includes(f.format)) errs.push(`format "${f.format}"`);
  if (!CONFIDENCE.includes(f.confidence)) errs.push(`confidence "${f.confidence}"`);
  if (!Number.isInteger(f.occurrences) || f.occurrences < 1) errs.push('occurrences');
  if (f.pluginId && !(f.pluginId.type && f.pluginId.value)) errs.push('pluginId');
  if (errs.length) throw new Error(`Invalid finding "${f?.name}": ${errs.join(', ')}`);
  return f;
}

export function validateReport(r) {
  if (!r || r.schema !== SCHEMA_VERSION) throw new Error('Report schema must be 2');
  if (!Array.isArray(r.files) || !Array.isArray(r.plugins) || !Array.isArray(r.media)) throw new Error('Report requires files, plugins and media arrays');
  r.plugins.forEach(validateFinding);
  return r;
}

/** Accepts v1 exports ({files, plugins}) or v2 reports and returns v2. */
export function migrateV1ToV2(r) {
  if (r?.schema === SCHEMA_VERSION) return r;
  if (!r || !Array.isArray(r.plugins)) throw new Error('Not a PluginChek report');
  return {
    schema: SCHEMA_VERSION, generated: r.generated || new Date().toISOString(), app: 'PluginChek',
    files: r.files || [], plugins: r.plugins.map(normalizeFinding), media: [], verdict: null,
  };
}

export function makeReport({ files = [], plugins = [], media = [], verdict = null, app = 'PluginChek' } = {}) {
  return { schema: SCHEMA_VERSION, generated: new Date().toISOString(), app, files, plugins, media, verdict };
}
