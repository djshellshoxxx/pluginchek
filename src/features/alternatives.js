// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// F7: up to 3 similar plugins from the database. "Similar, not identical": settings will not transfer.
import { checkCompat } from './compat.js';

const ORDER = { free: 0, freemium: 1, paid: 2 };
const PRICE_TEXT = { free: 'Free', freemium: 'Free tier available', paid: 'Paid' };

export function suggestAlternatives(f, db, target, max = 3) {
  const entry = f.dbId ? db.get(f.dbId) : db.lookup(f)?.entry;
  if (!entry) return [];
  return (entry.alternatives || [])
    .map(id => db.get(id)).filter(e => e && e.id !== entry.id && e.category === entry.category)
    .filter(e => !target || !['unavailable'].includes(checkCompat({ kind: 'plugin', format: 'VST3' }, target, e).status))
    .sort((a, b) => (ORDER[a.price] ?? 3) - (ORDER[b.price] ?? 3) || a.name.localeCompare(b.name))
    .slice(0, max)
    .map(e => ({ id: e.id, name: e.name, vendor: e.vendor, price: e.price, reason: `${PRICE_TEXT[e.price] || 'Price unknown'} ${e.category.toLowerCase()} by ${e.vendor}` }));
}
