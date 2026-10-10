// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Parser registry. Append one line per parser, alphabetical, to keep concurrent PRs mergeable.
import { ableton } from './ableton.js';
import { reaper } from './reaper.js';

export const PARSERS = [
  ableton,
  reaper,
];

/** Highest canParse() score wins; ties keep registry order. */
export function pickParser(name, ctx) {
  let best = null, score = 0;
  for (const p of PARSERS) {
    const s = Number(p.canParse(name, ctx)) || 0;
    if (s > score) { best = p; score = s; }
  }
  return best;
}
