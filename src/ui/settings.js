// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Guarded persistent settings (storage can be blocked or throw in private windows / previews).
const KEY = 'pluginchek:settings:v1';
let mem = {};
function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
export function getSettings() { return { ...load(), ...mem }; }
export function setSetting(k, v) {
  mem[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify({ ...load(), [k]: v })); } catch { /* keep in memory only */ }
}
export function resetSettings() { mem = {}; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
