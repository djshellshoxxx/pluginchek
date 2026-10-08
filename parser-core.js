// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

export const PROJECT_TYPES = [
  { exts: ['als'], daw: 'Ableton Live', container: 'gzip/XML', confidence: 'high' },
  { exts: ['rpp', 'rpp-bak'], daw: 'REAPER', container: 'text', confidence: 'high' },
  { exts: ['flp'], daw: 'FL Studio', container: 'binary', confidence: 'high' },
  { exts: ['song'], daw: 'Studio One', container: 'ZIP/container', confidence: 'high' },
  { exts: ['bwproject'], daw: 'Bitwig Studio', container: 'container', confidence: 'high' },
  { exts: ['cpr', 'npr'], daw: 'Cubase / Nuendo', container: 'binary', confidence: 'high' },
  { exts: ['ptx', 'pts'], daw: 'Pro Tools', container: 'binary', confidence: 'high' },
  { exts: ['logicx'], daw: 'Logic Pro', container: 'package/archive', confidence: 'high' },
  { exts: ['band'], daw: 'GarageBand', container: 'package/archive', confidence: 'high' },
  { exts: ['reason'], daw: 'Reason', container: 'binary/container', confidence: 'high' },
  { exts: ['zip'], daw: 'Unknown / packaged project', container: 'ZIP', confidence: 'medium' },
  { exts: ['xml'], daw: 'Unknown', container: 'XML', confidence: 'medium' },
  { exts: ['json'], daw: 'Unknown', container: 'JSON', confidence: 'medium' },
  { exts: ['txt'], daw: 'Unknown', container: 'text', confidence: 'low' },
];

const KB = [
  [/fabfilter\s*pro[- ]?q/i, 'FabFilter', 'EQ', 'Parametric equalizer for surgical correction, tone shaping and spectrum-aware EQ work.'],
  [/fabfilter\s*pro[- ]?c/i, 'FabFilter', 'Compressor', 'Dynamics compressor for level control, punch, transient shaping and side-chain work.'],
  [/fabfilter\s*pro[- ]?l/i, 'FabFilter', 'Limiter', 'Brickwall limiter for peak control and final loudness.'],
  [/fabfilter\s*pro[- ]?r/i, 'FabFilter', 'Reverb', 'Algorithmic reverb for room, ambience and spatial effects.'],
  [/fabfilter\s*saturn/i, 'FabFilter', 'Distortion / Saturation', 'Multiband saturation and distortion processor for harmonic colour and sound design.'],
  [/valhalla.*(vintage|room|plate|verb)/i, 'Valhalla DSP', 'Reverb', 'Algorithmic reverb for ambience, room and long-tail spatial effects.'],
  [/valhalla.*delay/i, 'Valhalla DSP', 'Delay', 'Creative delay processor for echoes, modulation and time-based effects.'],
  [/serum/i, 'Xfer Records', 'Instrument / Synth', 'Wavetable synthesizer used to create melodic, bass, pad and effect sounds.'],
  [/vital/i, 'Vital Audio', 'Instrument / Synth', 'Wavetable synthesizer with modulation and spectral processing.'],
  [/massive(\s*x)?/i, 'Native Instruments', 'Instrument / Synth', 'Software synthesizer for basses, leads, pads and sound design.'],
  [/kontakt/i, 'Native Instruments', 'Sampler', 'Software sampler and sample-library host.'],
  [/reaktor/i, 'Native Instruments', 'Instrument / Modular', 'Modular DSP environment hosting instruments and effects.'],
  [/ozone/i, 'iZotope', 'Mastering', 'Mastering suite for EQ, dynamics, imaging, limiting and analysis.'],
  [/neutron/i, 'iZotope', 'Channel Strip / Mixing', 'Mixing suite combining EQ, dynamics, transient and masking tools.'],
  [/rx\s*\d*/i, 'iZotope', 'Repair / Utility', 'Audio repair and restoration processor.'],
  [/soundtoys/i, 'Soundtoys', 'Creative Effect', 'Creative effects family covering saturation, delay, modulation, pitch and filtering.'],
  [/decapitator/i, 'Soundtoys', 'Distortion / Saturation', 'Analog-style saturation and distortion effect.'],
  [/echoboy/i, 'Soundtoys', 'Delay', 'Character delay and echo processor.'],
  [/little alterboy/i, 'Soundtoys', 'Pitch / Voice', 'Pitch and formant manipulation effect.'],
  [/waves/i, 'Waves', 'Mixing / Utility', 'Waves audio plugin; exact function depends on the specific plugin name recovered.'],
  [/arturia/i, 'Arturia', 'Instrument / Effect', 'Arturia software instrument or effect; exact role depends on the recovered product name.'],
  [/amplitube/i, 'IK Multimedia', 'Amp / Guitar', 'Guitar and bass amplifier, cabinet and effects modeling environment.'],
  [/guitar rig/i, 'Native Instruments', 'Amp / Guitar', 'Guitar/bass amp, cabinet and multi-effect processor.'],
  [/melodyne/i, 'Celemony', 'Pitch / Time', 'Pitch, timing and note-level audio editing processor.'],
  [/autotune|auto-tune/i, 'Antares', 'Pitch / Voice', 'Pitch-correction and vocal tuning processor.'],
  [/sylenth1/i, 'LennarDigital', 'Instrument / Synth', 'Virtual-analog synthesizer.'],
  [/omnisphere/i, 'Spectrasonics', 'Instrument / Synth', 'Hybrid sample/synthesis instrument for broad sound design.'],
  [/spitfire/i, 'Spitfire Audio', 'Sampler / Instrument', 'Sample-based instrument or library player.'],
  [/superior drummer/i, 'Toontrack', 'Drum Instrument', 'Sample-based drum instrument and mixer.'],
  [/addictive drums/i, 'XLN Audio', 'Drum Instrument', 'Sample-based drum instrument.'],
];

const CONF = { low: 1, medium: 2, high: 3 };

export function detectProjectType(fileName, bytes = null) {
  const lower = String(fileName || '').toLowerCase();
  const type = PROJECT_TYPES.find(t => t.exts.some(ext => lower.endsWith(`.${ext}`)));
  if (type) return { ...type };
  if (bytes?.length >= 4) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { daw: 'Unknown / packaged project', container: 'ZIP', confidence: 'medium' };
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return { daw: 'Unknown', container: 'gzip', confidence: 'medium' };
  }
  return { daw: 'Unknown', container: 'binary / unknown', confidence: 'low' };
}

export function extractPrintableStrings(bytes, minLength = 5, maxStrings = 25000) {
  const out = [];
  let cur = '';
  for (let i = 0; i < bytes.length && out.length < maxStrings; i++) {
    const c = bytes[i];
    if ((c >= 32 && c <= 126) || c === 9) cur += String.fromCharCode(c);
    else {
      if (cur.length >= minLength || /^(?:VST3?|AAX|AU|CLAP)$/i.test(cur.trim())) out.push(cur.trim());
      cur = '';
    }
  }
  if ((cur.length >= minLength || /^(?:VST3?|AAX|AU|CLAP)$/i.test(cur.trim())) && out.length < maxStrings) out.push(cur.trim());
  return out.filter(Boolean);
}

export function normalizeName(value) {
  return String(value || '')
    .replace(/\.(vst3|vst|component|aaxplugin|clap|dll)$/i, '')
    .replace(/^(vst3?|au|aax|clap)\s*[:\-]\s*/i, '')
    .replace(/\([^)]*(?:mono|stereo|x64|x86|vst3?|au|aax|clap)[^)]*\)/ig, '')
    .replace(/_+/g, ' ')
    .replace(/\s+(?:x64|x86|win64|win32|64[- ]?bit|32[- ]?bit)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function keyFor(name) {
  return normalizeName(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function inferFormat(line) {
  if (/\bvst3\b/i.test(line) || /\.vst3\b/i.test(line)) return 'VST3';
  if (/\bvst2\b/i.test(line) || /\bvst\b/i.test(line) || /\.dll\b/i.test(line)) return 'VST2 / VST';
  if (/\baudio\s*unit\b|\bau\s*[:\-]|\.component\b/i.test(line)) return 'AU';
  if (/\baax\b|\.aaxplugin\b/i.test(line)) return 'AAX';
  if (/\bclap\b|\.clap\b/i.test(line)) return 'CLAP';
  return 'Unknown';
}

export function enrichPlugin(name, vendor = '') {
  const probe = `${vendor} ${name}`;
  for (const [re, kbVendor, category, explanation] of KB) {
    if (re.test(probe)) return { vendor: vendor || kbVendor, category, explanation };
  }
  let category = 'Unknown';
  let explanation = 'Audio plugin reference recovered from the project. The saved file does not expose enough standardized metadata to identify its exact purpose.';
  if (/\beq\b|equali[sz]|\bequal\b/i.test(name)) category = 'EQ';
  else if (/compress|comp\b/i.test(name)) category = 'Compressor';
  else if (/limit|maxim/i.test(name)) category = 'Limiter';
  else if (/verb|reverb|room|plate/i.test(name)) category = 'Reverb';
  else if (/delay|echo/i.test(name)) category = 'Delay';
  else if (/satur|distort|drive|clip/i.test(name)) category = 'Distortion / Saturation';
  else if (/synth|serum|massive|vital|omnisphere/i.test(name)) category = 'Instrument / Synth';
  else if (/meter|scope|analy[sz]/i.test(name)) category = 'Analyzer';
  else if (/pitch|tune|melodyne/i.test(name)) category = 'Pitch / Time';
  if (category !== 'Unknown') explanation = `Likely ${category.toLowerCase()} plugin based on the recovered plugin name. Exact behavior depends on the installed version.`;
  return { vendor: vendor || 'Unknown', category, explanation };
}

function makeFinding(rawName, ctx, evidence, explicitFormat = '') {
  let name = normalizeName(rawName).replace(/^plugin\s*[:\-]\s*/i, '').trim();
  name = name.replace(/\s+\(([^()]*)\)\s*$/, (m, inside) => /mono|stereo|\d+ch/i.test(inside) ? '' : m).trim();
  let vendor = '';
  const vm = name.match(/^(.*?)\s+\(([^()]{2,50})\)$/);
  if (vm) { name = vm[1].trim(); vendor = vm[2].trim(); }
  const enriched = enrichPlugin(name, vendor);
  return {
    name,
    vendor: enriched.vendor,
    format: explicitFormat || inferFormat(evidence),
    category: enriched.category,
    explanation: enriched.explanation,
    confidence: ctx.confidence || 'medium',
    daw: ctx.daw || 'Unknown',
    sources: [ctx.source || 'unknown'],
    evidence: [evidence.slice(0, 500)],
    occurrences: 1,
    installedStatus: 'inventory not supplied',
  };
}

export function analyzeTextForPlugins(text, ctx = {}) {
  const findings = [];
  const lines = String(text || '').split(/\r?\n/);
  const add = (name, evidence, format = '', confidence = ctx.confidence || 'medium', seen = null) => {
    const cleaned = normalizeName(name).trim();
    if (cleaned.length < 2 || cleaned.length > 160) return false;
    if (/^(plugin|vst3?|audio unit|aax|clap|unknown)$/i.test(cleaned)) return false;
    const candidateKey = keyFor(cleaned.replace(/\s*\([^()]*\)\s*$/, ''));
    if (seen && [...seen].some(k => k === candidateKey || (Math.min(k.length, candidateKey.length) >= 5 && (k.includes(candidateKey) || candidateKey.includes(k))))) return false;
    seen?.add(candidateKey);
    findings.push(makeFinding(cleaned, { ...ctx, confidence }, evidence, format));
    return true;
  };

  const structuredEvidence = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lineSeen = new Set();
    let m = trimmed.match(/\b(VST3?|AU|AAX|CLAP)\s*[:\-]\s*([^"'<>\r\n]{2,160})/i);
    if (m) add(m[2].replace(/[>].*$/, '').replace(/\s+(?:preset|state|id)\s*=.*$/i, '').trim(), trimmed, m[1].toUpperCase().replace('VST', 'VST'), 'high', lineSeen);
    m = trimmed.match(/<VST[^>]*?["'](?:VST3?\s*:\s*)?([^"']+)["']/i);
    if (m) add(m[1], trimmed, inferFormat(trimmed) === 'Unknown' ? 'VST / VST3' : inferFormat(trimmed), 'high', lineSeen);
    m = trimmed.match(/(?:pluginName|plug-in|plugin|deviceName|name)\s*[=:]\s*["']([^"']{2,160})["']/i);
    if (m && /vst|plugin|device|audio/i.test(trimmed)) add(m[1], trimmed, inferFormat(trimmed), 'medium', lineSeen);
    m = trimmed.match(/([^\\/:*?"<>|\r\n]{2,120})\.(vst3|vst|component|aaxplugin|clap|dll)\b/i);
    if (m) add(m[1], trimmed, inferFormat(trimmed), 'high', lineSeen);
    if (lineSeen.size) structuredEvidence.add(trimmed);
  }

  const uniqueLines = [...new Set(lines.map(x => x.trim()).filter(x => x.length >= 3 && x.length <= 220))];
  for (const line of uniqueLines) {
    if (structuredEvidence.has(line)) continue;
    for (const [re] of KB) {
      if (re.test(line)) {
        const candidate = line
          .replace(/^.*?(?=(?:fabfilter|valhalla|serum|vital|massive|kontakt|reaktor|ozone|neutron|soundtoys|decapitator|echoboy|little alterboy|waves|arturia|amplitube|guitar rig|melodyne|auto[- ]?tune|sylenth1|omnisphere|spitfire|superior drummer|addictive drums))/i, '')
          .replace(/[<>{}\[\]"']/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 120)
          .trim();
        if (candidate) add(candidate, line, inferFormat(line), 'medium');
        break;
      }
    }
  }
  return findings;
}

export function mergePluginFindings(findings) {
  const map = new Map();
  for (const f of findings || []) {
    if (!f?.name) continue;
    const key = keyFor(f.name);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...f,
        evidence: [...new Set(f.evidence || [])],
        sources: [...new Set(f.sources || [])],
        occurrences: f.occurrences || 1,
      });
      continue;
    }
    existing.occurrences += f.occurrences || 1;
    existing.evidence = [...new Set([...(existing.evidence || []), ...(f.evidence || [])])];
    existing.sources = [...new Set([...(existing.sources || []), ...(f.sources || [])])];
    if (CONF[f.confidence] > CONF[existing.confidence]) existing.confidence = f.confidence;
    if (existing.format === 'Unknown' && f.format !== 'Unknown') existing.format = f.format;
    if ((existing.vendor === 'Unknown' || !existing.vendor) && f.vendor) existing.vendor = f.vendor;
    if (existing.category === 'Unknown' && f.category !== 'Unknown') {
      existing.category = f.category;
      existing.explanation = f.explanation;
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function matchInventory(findings, inventoryPaths = []) {
  const inv = inventoryPaths.map(path => ({ path, key: keyFor(path.split(/[\\/]/).pop()) }));
  return (findings || []).map(f => {
    const key = keyFor(f.name);
    const exact = inv.find(i => i.key === key || (key.length >= 5 && i.key.length >= 5 && (i.key.includes(key) || key.includes(i.key))));
    if (exact) return { ...f, installedStatus: 'matched', inventoryMatch: exact.path };
    const tokens = normalizeName(f.name).toLowerCase().split(' ').filter(t => t.length > 2);
    const possible = inv.find(i => tokens.length >= 2 && tokens.filter(t => i.key.includes(t.replace(/[^a-z0-9]/g, ''))).length >= Math.min(2, tokens.length));
    if (possible) return { ...f, installedStatus: 'possible match', inventoryMatch: possible.path };
    return { ...f, installedStatus: inventoryPaths.length ? 'not found' : 'inventory not supplied' };
  });
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection from untrusted project text
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function makeCsvReport(findings) {
  const headers = ['Name','Vendor','Format','Category','Confidence','Occurrences','Installed','Explanation'];
  const rows = (findings || []).map(f => [f.name,f.vendor,f.format,f.category,f.confidence,f.occurrences,f.installedStatus,f.explanation].map(csvCell).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export function makeTextReport(files, findings) {
  const lines = ['PLUGINChek PROJECT REPORT', '========================', ''];
  lines.push(`Files analyzed: ${files.length}`);
  lines.push(`Unique plugins: ${findings.length}`);
  lines.push(`Plugin references: ${findings.reduce((n, f) => n + (f.occurrences || 1), 0)}`);
  lines.push('');
  for (const f of findings) {
    lines.push(`${f.name} — ${f.vendor || 'Unknown vendor'}`);
    lines.push(`  Format: ${f.format} | Category: ${f.category} | Confidence: ${f.confidence} | Instances/evidence: ${f.occurrences}`);
    lines.push(`  Installed: ${f.installedStatus}`);
    lines.push(`  ${f.explanation}`);
    if (f.sources?.length) lines.push(`  Sources: ${f.sources.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function parseInventoryText(text, fileName = '') {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (/\.json$/i.test(fileName) || /^[\[{]/.test(raw)) {
    try {
      const parsed = JSON.parse(raw);
      const values = [];
      const visit = value => {
        if (typeof value === 'string') values.push(value.trim());
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
      };
      visit(parsed);
      return [...new Set(values.filter(Boolean))];
    } catch {
      // Fall through to delimited text so malformed JSON still remains usable.
    }
  }
  return [...new Set(raw.split(/\r?\n|,/).map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))];
}

export function makeRecoveryChecklist(findings) {
  const unresolved = (findings || []).filter(f => f.installedStatus === 'not found' || f.installedStatus === 'possible match');
  const missing = unresolved.filter(f => f.installedStatus === 'not found');
  const possible = unresolved.filter(f => f.installedStatus === 'possible match');
  const lines = [
    'PLUGINChek RECOVERY CHECKLIST',
    '============================',
    '',
    `${missing.length} missing | ${possible.length} possible match${possible.length === 1 ? '' : 'es'}`,
    '',
  ];
  if (!unresolved.length) {
    lines.push('No missing or uncertain plugin matches were found in the supplied inventory.');
    return lines.join('\n');
  }
  const addSection = (title, items) => {
    if (!items.length) return;
    lines.push(title, '-'.repeat(title.length));
    for (const f of [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      lines.push(`[ ] ${f.name} — ${f.vendor || 'Unknown vendor'} — ${f.format || 'Unknown format'}`);
      if (f.sources?.length) lines.push(`    Project source: ${f.sources.join(', ')}`);
      if (f.inventoryMatch) lines.push(`    Possible installed match: ${f.inventoryMatch}`);
    }
    lines.push('');
  };
  addSection('MISSING PLUGINS', missing);
  addSection('VERIFY POSSIBLE MATCHES', possible);
  return lines.join('\n').trimEnd();
}
