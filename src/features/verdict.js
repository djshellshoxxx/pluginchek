// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F5: overall verdict. Never claims "missing" unless an inventory was supplied.
export function computeVerdict(findings, { inventoryLoaded = false, media = [] } = {}) {
  const real = findings.filter(f => f.kind !== 'stock');
  const c = { total: real.length, matched: 0, possible: 0, missing: 0, stock: findings.length - real.length, lowConfidence: 0, missingFree: 0, missingPaid: 0 };
  const missingMedia = media.filter(m => m.status === 'missing').length;
  for (const f of real) {
    const s = f.installed?.status;
    if (s === 'matched') c.matched++; else if (s === 'possible') c.possible++; else if (s === 'missing') c.missing++;
    if (f.confidence === 'low') c.lowConfidence++;
    if (s === 'missing') { if (f.price === 'free') c.missingFree++; else if (f.price === 'paid' || f.price === 'freemium') c.missingPaid++; }
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let level, headline;
  if (!real.length) { level = 'unknown'; headline = 'No plugin references were confidently recovered.'; }
  else if (!inventoryLoaded) { level = 'unknown'; headline = `Found ${plural(c.total, 'plugin')}. Load your installed plugins to see what is missing.`; }
  else if (c.missing && real.some(f => f.installed.status === 'missing' && f.confidence !== 'low')) {
    level = 'blocked';
    const split = c.missingFree || c.missingPaid ? ` (${c.missingFree} free, ${c.missingPaid} paid or freemium)` : '';
    headline = `This project uses ${plural(c.total, 'plugin')}; ${c.matched} installed; ${c.missing} missing${split}.`;
  } else if (c.missing || c.possible || c.lowConfidence) {
    level = 'attention';
    headline = `${plural(c.total, 'plugin')} found; ${c.matched} installed; ${c.possible + c.missing} need${c.possible + c.missing === 1 ? 's' : ''} checking.`;
  } else if (missingMedia) { level = 'attention'; headline = `All ${plural(c.total, 'plugin')} found, but ${plural(missingMedia, 'audio/sample file')} could not be found.`; }
  else { level = 'ready'; headline = `All ${plural(c.total, 'plugin')} found on this computer.`; }
  const details = [];
  if (c.stock) details.push(`${plural(c.stock, 'built-in device')} not counted.`);
  if (c.lowConfidence) details.push(`${c.lowConfidence} low-confidence result${c.lowConfidence === 1 ? '' : 's'} came from a text scan, not structured project data.`);
  if (missingMedia && level !== 'attention') details.push(`${plural(missingMedia, 'audio/sample file')} could not be found.`);
  return { level, headline, counts: c, details, missingMedia };
}

export const isProblem = f => f.kind !== 'stock' && (['missing', 'possible'].includes(f.installed?.status) || f.confidence === 'low');
