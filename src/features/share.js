// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F8: shareable "what you need" package. Output contains no scripts or external requests.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rows(findings, redact) {
  return findings.filter(f => f.kind !== 'stock').map(f => ({
    name: f.name, vendor: f.vendor, format: f.format, category: f.category, price: f.price || '',
    status: f.installed?.status || 'unknown', tracks: redact ? [] : f.tracks || [],
  }));
}

export function makeShareHtml(findings, { daw = 'DAW', redact = true, generated = new Date().toISOString().slice(0, 10) } = {}) {
  const r = rows(findings, redact);
  const tr = r.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.vendor)}</td><td>${esc(p.format)}</td><td>${esc(p.category)}</td><td>${esc(p.price)}</td>${redact ? '' : `<td>${esc(p.tracks.join(', '))}</td>`}</tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plugins needed to open this project</title>
<style>body{font:16px system-ui,sans-serif;margin:2rem auto;max-width:880px;padding:0 1rem;color:#111}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:.4rem;text-align:left}th{background:#f3f3f3}small{color:#555}@media print{body{margin:0}}</style></head>
<body><h1>Plugins needed for this ${esc(daw)} project</h1><p><small>Generated ${esc(generated)} by PluginChek. Plugins listed: ${r.length}. Built-in DAW devices are not listed.</small></p>
<table><thead><tr><th>Plugin</th><th>Vendor</th><th>Format</th><th>Type</th><th>Price</th>${redact ? '' : '<th>Tracks</th>'}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
}

export function makeShareMarkdown(findings, { daw = 'DAW', redact = true, generated = new Date().toISOString().slice(0, 10) } = {}) {
  const md = s => String(s ?? '').replace(/[|\\`*_<>[\]]/g, m => `\\${m}`).replace(/\r?\n/g, ' ');
  return [`# Plugins needed for this ${md(daw)} project`, '', `_Generated ${generated} by PluginChek._`, '',
    `| Plugin | Vendor | Format | Type | Price |${redact ? '' : ' Tracks |'}`, `|---|---|---|---|---|${redact ? '' : '---|'}`,
    ...rows(findings, redact).map(p => `| ${md(p.name)} | ${md(p.vendor)} | ${md(p.format)} | ${md(p.category)} | ${md(p.price)} |${redact ? '' : ` ${md(p.tracks.join(', '))} |`}`)].join('\n');
}
