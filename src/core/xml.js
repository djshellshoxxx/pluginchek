// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Tolerant streaming XML tokenizer (no DOM; works in browser, Worker and Node).
const TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
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

/**
 * Walk tags. open(tag, attrs, stack) / close(tag, stack): `stack` holds ancestors only (excludes current tag).
 * Throws if maxTags is exceeded so hostile files cannot hang the UI.
 */
export function scanXml(text, { open, close, maxTags = 6_000_000, maxDepth = 512 } = {}) {
  const stack = [];
  let n = 0, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(text))) {
    if (m[2] === undefined) continue;
    if (++n > maxTags) throw new Error('XML tag limit exceeded');
    const tag = m[2];
    if (m[1]) { // closing tag: pop to the matching open tag if present
      const i = stack.lastIndexOf(tag);
      if (i < 0) continue;
      stack.length = i;
      close?.(tag, stack);
    } else {
      open?.(tag, parseAttrs(m[3]), stack);
      if (m[4]) close?.(tag, stack);
      else { if (stack.length >= maxDepth) throw new Error('XML depth limit exceeded'); stack.push(tag); }
    }
  }
}
