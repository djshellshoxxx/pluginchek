// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// REAPER (.rpp / .rpp-bak) structured parser (VST/AU/CLAP/JS FX chain entries and media sources).

/** Split a REAPER line into tokens, honouring "double", 'single' and `backtick` quotes. */
export function splitTokens(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return out;
}

const CHANNELS = /^(?:\d+\s*(?:out|in|ch)|mono|stereo|x64|x86|64[- ]?bit)/i;

/** "VST3: Pro-Q 3 (FabFilter)" -> {fmt, name, vendor} */
export function parseDisplay(display) {
  const m = /^(VST3?i?|AUi?|CLAPi?|DXi?):\s*(.*)$/i.exec(display.trim());
  if (!m) return null;
  let name = m[2].trim(), vendor = '';
  for (let i = 0; i < 3; i++) {
    const g = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name);
    if (!g) break;
    name = g[1].trim();
    if (CHANNELS.test(g[2].trim())) continue;
    vendor = g[2].trim();
    break;
  }
  const k = m[1].toUpperCase().replace(/I$/, '');
  return { fmt: { VST: 'VST2', VST3: 'VST3', AU: 'AU', CLAP: 'CLAP', DX: 'Unknown' }[k] || 'Unknown', name, vendor };
}

/** Plugin ID token such as `1397572658{ABCD...}` (VST3 GUID) or `1919247729<5653...>` (VST2 unique id). VERIFY against fixtures. */
export function parseId(tokens, fmt) {
  for (const t of tokens) {
    const m = /^(-?\d+)(?:[{<]([0-9A-Fa-f]+))?/.exec(t);
    if (!m || t.length < 5) continue;
    if (fmt === 'VST3' && m[2] && m[2].length >= 32) return { type: 'vst3-cid', value: m[2].slice(0, 32).toUpperCase() };
    if (fmt === 'VST2' && m[1] !== '0') return { type: 'vst2-fourcc', value: String(Number(m[1]) >>> 0) };
    if (fmt === 'CLAP' && !/^\d+$/.test(t)) return { type: 'clap-id', value: t };
  }
  return null;
}

export const reaper = {
  id: 'reaper',
  canParse: (name, { text }) => (/\.rpp(-bak)?$/i.test(name) ? 2 : 0) || (text && /^\s*<REAPER_PROJECT/.test(text.slice(0, 200)) ? 2 : 0),

  async parse({ name, text }) {
    const findings = [], media = [];
    const stack = [];
    let track = '', version = '';
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line === '>') { const b = stack.pop(); if (b === 'TRACK') track = ''; continue; }
      if (line[0] === '<') {
        const tok = splitTokens(line.slice(1));
        const block = (tok[0] || '').toUpperCase();
        if (block === 'REAPER_PROJECT') version = tok[2] || tok[1] || '';
        if (block === 'TRACK') track = '';
        stack.push(block);
        const base = { daw: 'REAPER', sources: [name], occurrences: 1, tracks: track ? [track] : [] };
        if (block === 'VST' || block === 'AU' || block === 'CLAP') {
          const p = parseDisplay(tok[1] || '');
          const pid = p ? parseId(tok.slice(3), p.fmt) : null;
          if (p && p.name) findings.push({ ...base, name: p.name, vendor: p.vendor, format: p.fmt, pluginId: pid, kind: 'plugin', confidence: pid ? 'high' : 'medium', evidence: [line.slice(0, 300)] });
        } else if (block === 'JS' && tok[1]) {
          findings.push({ ...base, name: tok[2] || tok[1], vendor: 'REAPER', format: 'Unknown', kind: 'stock', confidence: 'high', category: 'Utility', explanation: `REAPER JSFX effect (${tok[1]}).`, evidence: [line.slice(0, 300)] });
        }
        continue;
      }
      const top = stack[stack.length - 1];
      if (top === 'TRACK' && /^NAME\s/.test(line)) { track = splitTokens(line)[1] || ''; continue; }
      if (top === 'SOURCE' && /^FILE\s/.test(line)) {
        const p = splitTokens(line)[1];
        if (p) media.push({ kind: 'audio', path: p, absPath: /^([a-z]:[\\/]|[\\/])/i.test(p) ? p : '', relPath: /^([a-z]:[\\/]|[\\/])/i.test(p) ? '' : p, resolvedPath: null, status: 'unchecked', source: name, occurrences: 1 });
      }
    }
    return { findings, media, notes: [`REAPER project parsed structurally${version ? ` (v${version})` : ''}.`], meta: { version } };
  },
};
