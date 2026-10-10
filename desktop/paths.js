// PluginChek™ — Copyright © 2026 Sheldon Davidson. MIT License. SPDX-License-Identifier: MIT
import path from 'node:path';

// Static site files the app:// scheme may serve. Directory allowlist: src/**/*.js only.
const SERVABLE = /^(index\.html|styles\.css|ui-assistance\.js|parser-core\.js|src\/[\w./-]+\.js)$/;

/** Map an app:// URL path to a file under `root`, or null when it is not servable (traversal-safe). */
export function resolveAppPath(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html'; } catch { return null; }
  if (rel.includes('\\') || rel.includes('\0') || rel.split('/').includes('..') || !SERVABLE.test(rel)) return null;
  const full = path.resolve(root, rel);
  return path.relative(root, full).startsWith('..') ? null : full;
}
