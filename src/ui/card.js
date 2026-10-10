// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F12: local project card PNG (1200x630). No network, no file names.
export async function makeProjectCard(findings, daw, lines) {
  const real = findings.filter(f => f.kind !== 'stock');
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#0E1116'; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = '#E8532A'; g.fillRect(0, 0, 12, 630);
  g.fillStyle = '#E6E8EC'; g.font = '700 54px system-ui, sans-serif'; g.fillText('PluginChek', 60, 100);
  g.fillStyle = '#8A929E'; g.font = '24px system-ui, sans-serif'; g.fillText(`${daw} project`, 60, 140);
  g.fillStyle = '#4FB6C4'; g.font = '700 120px ui-monospace, monospace'; g.fillText(String(real.length), 60, 290);
  g.fillStyle = '#E6E8EC'; g.font = '28px system-ui, sans-serif'; g.fillText('plugins', 60, 330);
  const vendors = new Map();
  for (const f of real) if (f.vendor) vendors.set(f.vendor, (vendors.get(f.vendor) || 0) + 1);
  const top = [...vendors.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);
  g.fillStyle = '#8A929E'; g.font = '22px system-ui, sans-serif'; g.fillText('TOP VENDORS', 560, 90);
  g.fillStyle = '#E6E8EC'; g.font = '30px system-ui, sans-serif';
  top.forEach(([v, n], i) => g.fillText(`${v}  ×${n}`, 560, 140 + i * 44));
  const sig = [...real].sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name))[0];
  if (sig) { g.fillStyle = '#8A929E'; g.font = '22px system-ui, sans-serif'; g.fillText('SIGNATURE PLUGIN', 560, 360); g.fillStyle = '#E8532A'; g.font = '700 40px system-ui, sans-serif'; g.fillText(sig.name.slice(0, 28), 560, 410); }
  g.fillStyle = '#E6E8EC'; g.font = '26px system-ui, sans-serif';
  lines.slice(0, 3).forEach((l, i) => g.fillText(l.slice(0, 70), 60, 450 + i * 40));
  g.fillStyle = '#8A929E'; g.font = '18px system-ui, sans-serif'; g.fillText('Analysed locally · Circuit Drift Lab', 60, 600);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
