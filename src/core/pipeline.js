// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Browser/Node-neutral analysis pipeline: bytes in, findings + media out.
import { detectProjectType, extractPrintableStrings, analyzeTextForPlugins } from '../../parser-core.js';
import { decodeText, gunzip, isGzip, isZip, unzipTextEntries, MAX_DECOMPRESSED } from './zip.js';
import { mergeFindings } from './merge.js';
import { defaultDb } from './db.js';
import { normalizeFinding } from './schema.js';
import { pickParser } from '../parsers/index.js';

const abortCheck = signal => { if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError'); };

export function dedupeMedia(list) {
  const map = new Map();
  for (const m of list) {
    const k = `${m.kind}|${m.path}`;
    const ex = map.get(k);
    if (ex) ex.occurrences += m.occurrences || 1; else map.set(k, { ...m, occurrences: m.occurrences || 1 });
  }
  return [...map.values()];
}

/**
 * @param {string} name file name
 * @param {number} size original file size in bytes
 * @param {Uint8Array} bytes file contents (possibly truncated by the caller)
 * @param {{deepScan?:boolean,minString?:number,signal?:AbortSignal,onProgress?:Function,db?:object,truncated?:boolean}} opts
 */
export async function analyzeBytes(name, size, bytes, opts = {}) {
  const { deepScan = true, minString = 5, signal, onProgress, db = defaultDb } = opts;
  const type = detectProjectType(name, bytes);
  const rec = { name, size, daw: type.daw, container: type.container, confidence: type.confidence, notes: [], members: 0, truncated: !!opts.truncated, parser: 'legacy-strings' };
  if (rec.truncated) rec.notes.push('File was larger than the in-memory scan limit; only the first part was analyzed.');
  let findings = [], media = [];
  const chunks = [];
  const strings = (b, source) => chunks.push({ source, text: extractPrintableStrings(b, minString).join('\n'), confidence: 'low' });

  abortCheck(signal); onProgress?.({ stage: 'decode', pct: 10 });
  let payload = bytes, gzFailed = false;
  if (isGzip(bytes)) {
    try { payload = await gunzip(bytes, opts.maxDecompressed || MAX_DECOMPRESSED); rec.notes.push('gzip payload decompressed locally.'); }
    catch (e) { gzFailed = true; rec.notes.push(`gzip decode failed: ${e.message}`); }
  }
  abortCheck(signal);

  const head = decodeText(payload.subarray(0, 4096));
  const parser = gzFailed ? null : pickParser(name, { text: head });
  let structured = false;
  if (parser) {
    try {
      onProgress?.({ stage: 'parse', pct: 40 });
      const res = await parser.parse({ name, payload, text: decodeText(payload) });
      findings = res.findings; media = res.media; rec.notes.push(...res.notes);
      rec.parser = parser.id; rec.daw = res.findings[0]?.daw || rec.daw; rec.confidence = 'high'; rec.container = rec.container || 'structured';
      if (res.meta?.version) rec.version = res.meta.version;
      structured = true;
    } catch (e) {
      rec.notes.push(`Structured parse failed (${e.message}); used string scan (low confidence).`);
    }
  }

  if (!structured) {
    abortCheck(signal); onProgress?.({ stage: 'scan', pct: 60 });
    try {
      if (gzFailed) strings(bytes, name);
      else if (isGzip(bytes)) chunks.push({ source: name, text: decodeText(payload), confidence: 'high' });
      else if (isZip(bytes) || /\.(song|zip|logicx|band)$/i.test(name)) {
        const entries = deepScan ? await unzipTextEntries(bytes) : [];
        rec.members = entries.length;
        for (const e of entries) chunks.push({ source: `${name} › ${e.name}`, text: e.text, confidence: 'high' });
        rec.notes.push(deepScan ? (entries.length ? `${entries.length} textual archive members inspected.` : 'Archive/container detected; no readable textual members recovered.') : 'Deep archive scan disabled; container scanned using printable strings only.');
        if (!entries.length) strings(bytes, name);
      } else if (/\.(rpp|rpp-bak|xml|json|txt)$/i.test(name)) chunks.push({ source: name, text: decodeText(bytes), confidence: 'high' });
      else { strings(bytes, name); rec.notes.push('Proprietary/unknown binary scanned using printable-string evidence.'); }
    } catch (e) {
      rec.notes.push(`Decoder fallback used: ${e.message}`);
      strings(bytes, name);
    }
    for (const c of chunks) findings.push(...analyzeTextForPlugins(c.text, { source: c.source, daw: type.daw, confidence: c.confidence }));
  }

  abortCheck(signal); onProgress?.({ stage: 'enrich', pct: 85 });
  findings = mergeFindings(findings.map(f => db.enrich(normalizeFinding(f))));
  onProgress?.({ stage: 'done', pct: 100 });
  return { rec, findings, media: dedupeMedia(media) };
}
