// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F12: friendly, deterministic "stack personality" lines. Never negative about the user.
export function personality(findings) {
  const real = findings.filter(f => f.kind !== 'stock');
  if (!real.length) return ['A blank canvas: nothing but built-in tools so far.'];
  const count = pred => real.filter(pred).length;
  const by = (get) => { const m = new Map(); for (const f of real) { const k = get(f); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const out = [];
  const [v, vn] = by(f => f.vendor)[0] || [];
  if (v && vn >= 2) out.push(`Your most-used vendor is ${v} (${vn} plugins).`);
  const rules = [
    [count(f => f.category === 'Reverb') >= 3, `Reverb enthusiast: ${count(f => f.category === 'Reverb')} reverbs in one project.`],
    [count(f => f.category === 'EQ') >= 4, 'Tone sculptor: EQ is your favourite tool.'],
    [count(f => f.category.startsWith('Instrument')) >= 4, 'Sound designer: lots of instruments in the mix.'],
    [count(f => f.category === 'Compressor') >= 4, 'Dynamics wrangler: compression everywhere.'],
    [count(f => f.category === 'Delay') >= 3, 'Echo artist: delays galore.'],
    [count(f => f.price === 'free') >= 3, 'Smart on a budget: several free plugins doing real work.'],
    [count(f => f.category === 'Distortion / Saturation') >= 2, 'Warmth seeker: saturation is part of your sound.'],
    [real.length >= 30, 'Heavy rig: over 30 plugins. Mind the CPU!'],
    [real.length <= 5, 'Minimalist: a lean, focused plugin list.'],
  ];
  for (const [ok, text] of rules) if (ok) out.push(text);
  return out.slice(0, 4).length ? out.slice(0, 4) : ['A balanced toolkit: a bit of everything.'];
}
