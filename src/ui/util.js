// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const humanBytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export function download(name, data, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function toast(msg, actionLabel, onAction, ms = 10000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.textContent = msg + ' ';
  if (actionLabel) { const b = document.createElement('button'); b.className = 'button outline'; b.type = 'button'; b.textContent = actionLabel; b.onclick = () => { onAction(); t.remove(); }; t.append(b); }
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
export const dirOf = p => String(p).replace(/[\\/][^\\/]*$/, '');
