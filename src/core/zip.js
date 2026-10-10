// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Bounded gzip / ZIP readers. All limits exist to stop decompression bombs.
export const MAX_DECOMPRESSED = 256 * 1024 * 1024;
const td = new TextDecoder('utf-8', { fatal: false });
export const decodeText = bytes => td.decode(bytes);

async function inflate(bytes, format, cap) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { await reader.cancel(); throw new Error(`Decompressed size exceeds ${Math.round(cap / 1048576)} MB limit`); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export const gunzip = (bytes, cap = MAX_DECOMPRESSED) => inflate(bytes, 'gzip', cap);
export const isGzip = b => b?.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
export const isZip = b => b?.length > 3 && b[0] === 0x50 && b[1] === 0x4b;

/** Read textual ZIP members (central directory). Caps entry count and sizes. */
export async function unzipTextEntries(bytes, { maxEntries = 5000, maxEntryBytes = 60_000_000, maxTotalBytes = 200_000_000, maxRetainedChars = 64_000_000, textOnly = true, signal } = {}) {
  let total = 0, retained = 0;
  const usedOffsets = new Set();
  const out = [];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = o => v.getUint16(o, true), u32 = o => v.getUint32(o, true);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  const count = Math.min(u16(eocd + 10), maxEntries);
  let p = u32(eocd + 16);
  for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
    if (u32(p) !== 0x02014b50) break;
    const method = u16(p + 10), csize = u32(p + 20), usize = u32(p + 24), nlen = u16(p + 28), xlen = u16(p + 30), clen = u16(p + 32), local = u32(p + 42);
    const name = decodeText(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    if (csize > 30_000_000 || usize > maxEntryBytes || usedOffsets.has(local)) continue; // overlapping/duplicate entries are a zip-bomb signature
    usedOffsets.add(local);
    if (textOnly && !/\.(xml|json|txt|plist|rpp|cfg|ini|vstpreset|settings?)$|metadata|project|song|plugin/i.test(name)) continue;
    try {
      if (local + 30 > bytes.length) continue;
      const start = local + 30 + u16(local + 26) + u16(local + 28);
      let data = bytes.subarray(start, start + csize);
      if (method === 8) data = await inflate(data, 'deflate-raw', Math.min(maxEntryBytes, maxTotalBytes - total));
      else if (method !== 0) continue;
      total += data.length;
      const txt = decodeText(data).slice(0, 8_000_000);
      retained += txt.length;
      out.push({ name, text: txt });
      if (total >= maxTotalBytes || retained >= maxRetainedChars) break;
    } catch (e) { if (e.name === 'AbortError') throw e; /* unreadable or over-budget member: skip */ }
  }
  return out;
}
