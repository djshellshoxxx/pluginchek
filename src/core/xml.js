// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Tolerant streaming XML tokenizer (no DOM; works in browser, Worker and Node).
const ATTR = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.includes('&') ? s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  }) : s;
}

function parseAttrs(src) {
  const out = {};
  if (!src) return out;
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(src))) out[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
  return out;
}

const NAME = /^(\/?)([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)$/;
const MAX_TAG = 65536;

/**
 * Walk tags. open(tag, attrs, stack) / close(tag, stack): `stack` holds ancestors only (excludes current tag).
 * Linear-time: every skip uses indexOf, never a backtracking regex, so crafted input cannot stall the UI.
 * Throws if maxTags/maxDepth is exceeded.
 */
export function scanXml(text, { open, close, maxTags = 6_000_000, maxDepth = 512 } = {}) {
  const stack = [];
  let n = 0, i = 0;
  const len = text.length;
  while ((i = text.indexOf('<', i)) !== -1) {
    const c = text.charCodeAt(i + 1);
    if (c === 33 /* ! */ && text.startsWith('<!--', i)) { const e = text.indexOf('-->', i + 4); if (e < 0) break; i = e + 3; continue; }
    if (c === 33 && text.startsWith('<![CDATA[', i)) { const e = text.indexOf(']]>', i + 9); if (e < 0) break; i = e + 3; continue; }
    if (c === 63 /* ? */ || c === 33) { const e = text.indexOf('>', i + 2); if (e < 0) break; i = e + 1; continue; }
    // find the closing '>' while ignoring any '>' inside quoted attribute values
    let e = i + 1, quote = 0;
    for (; e < len && e - i < MAX_TAG; e++) {
      const ch = text.charCodeAt(e);
      if (ch === 60) break; // '<' can never appear inside a tag: stop here so every character is scanned at most once
      if (quote) { if (ch === quote) quote = 0; } else if (ch === 34 || ch === 39) quote = ch; else if (ch === 62) break;
    }
    if (e >= len || e - i >= MAX_TAG || text.charCodeAt(e) !== 62) { i = Math.max(i + 1, e); continue; } // unterminated / oversized: resume at the stopping point
    const m = NAME.exec(text.slice(i + 1, e));
    i = e + 1;
    if (!m) continue;
    if (++n > maxTags) throw new Error('XML tag limit exceeded');
    const tag = m[2];
    if (m[1]) {
      const k = stack.lastIndexOf(tag);
      if (k < 0) continue;
      stack.length = k;
      close?.(tag, stack);
    } else {
      open?.(tag, parseAttrs(m[3]), stack);
      if (m[4]) close?.(tag, stack);
      else { if (stack.length >= maxDepth) throw new Error('XML depth limit exceeded'); stack.push(tag); }
    }
  }
}
