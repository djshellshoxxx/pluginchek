// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

import { analyzeBytes } from '../core/pipeline.js';
import { mergeFindings, keyOf } from '../core/merge.js';
import { makeReport, migrateV1ToV2 } from '../core/schema.js';
import { defaultDb as db } from '../core/db.js';
import { matchInventory, pluginPathsFromFiles } from '../core/inventory.js';
import { parseInventoryText, makeCsvReport, makeTextReport, makeRecoveryChecklist } from '../../parser-core.js';
import { resolveMedia, candidatePaths, summarizeMedia, makeMediaCsv } from '../features/media.js';
import { computeVerdict, isProblem } from '../features/verdict.js';
import { checkCompat, summarizeCompat } from '../features/compat.js';
import { suggestAlternatives } from '../features/alternatives.js';
import { comparePlugins, compareMarkdown } from '../features/compare.js';
import { computeStats, statsCsv, unusedInstalled } from '../features/stats.js';
import { personality } from '../features/personality.js';
import { makeShareHtml, makeShareMarkdown } from '../features/share.js';
import { getSettings, setSetting } from './settings.js';
import { $, esc, humanBytes, download, toast, dirOf } from './util.js';
import { makeProjectCard } from './card.js';

const MAX_READ = 400 * 1024 * 1024;
const bridge = window.pluginchek || null; // desktop preload API (undefined in the browser)
let chain = Promise.resolve(); // serialise ingestion so concurrent opens cannot clobber state.ac
const enqueue = fn => (chain = chain.then(fn, fn));
const state = { reports: [], findings: [], media: [], inventory: [], projectFiles: [], snapshot: null, target: { os: 'win', arch: 'x64' }, ac: null };

/* ---------- derived data ---------- */
function recompute() {
  const all = state.reports.flatMap(r => r.findings);
  state.findings = matchInventory(mergeFindings(all), state.inventory, { db });
  const media = new Map();
  for (const r of state.reports) for (const m of r.media) { const k = `${m.source}|${m.kind}|${m.path}`; if (!media.has(k) || m.status !== 'unchecked') media.set(k, m); }
  const list = [...media.values()];
  state.media = state.projectFiles.length ? resolveMedia(list, state.projectFiles) : list; // a chosen project folder overrides desktop existence checks
  render();
}

/* ---------- ingestion ---------- */
function showProgress(on, text = '', pct = 0) {
  $('#progress').classList.toggle('hidden', !on);
  $('#progressBar').value = pct; $('#progressText').textContent = text;
}

async function ingest(name, size, bytes, { path = '', truncated = false } = {}) {
  const s = getSettings();
  const res = await analyzeBytes(name, size, bytes, {
    deepScan: $('#deepScan').checked, minString: +$('#minString').value || 5, signal: state.ac?.signal, truncated, db,
    onProgress: p => showProgress(true, `${name}: ${p.stage}`, p.pct),
  });
  res.rec.path = path;
  if (bridge?.fsExists && res.media.length) {
    const cands = candidatePaths(res.media, path ? dirOf(path) : '');
    const ex = cands.some(Boolean) ? await existsChunked(cands.filter(Boolean)) : null;
    if (ex) { let i = 0; res.media = res.media.map((m, idx) => (cands[idx] ? { ...m, status: ex[i++] ? 'present' : 'missing' } : m)); }
  }
  void s;
  state.reports.push(res);
}

async function existsChunked(paths) {
  const out = [];
  for (let i = 0; i < paths.length; i += 10000) {
    const part = paths.slice(i, i + 10000), r = await bridge.fsExists(part);
    if (!Array.isArray(r) || r.length !== part.length) return null; // refuse to guess: leave media unchecked
    out.push(...r);
  }
  return out;
}

const handleFiles = files => enqueue(() => runFiles(files));
const handlePaths = paths => enqueue(() => runPaths(paths));

async function runFiles(files) {
  if (!files.length) return;
  $('#workspace').classList.remove('hidden');
  state.ac = new AbortController();
  let done = 0;
  try {
    for (const file of files) {
      showProgress(true, `${file.name}: reading`, 5);
      try {
        const path = bridge?.pathForFile ? bridge.pathForFile(file) : '';
        const bytes = new Uint8Array(await file.slice(0, MAX_READ).arrayBuffer());
        await ingest(file.name, file.size, bytes, { path, truncated: file.size > MAX_READ });
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        state.reports.push({ rec: { name: file.name, size: file.size, daw: 'Unknown', container: 'unreadable', confidence: 'low', notes: [`Could not analyze file: ${err.message}`], members: 0, truncated: false }, findings: [], media: [] });
      }
      done++;
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
    toast(`Cancelled after ${done} file${done === 1 ? '' : 's'}.`);
  } finally { showProgress(false); state.ac = null; }
  recompute();
}

async function runPaths(paths) { // desktop: files opened from the OS / batch folder
  $('#workspace').classList.remove('hidden');
  state.ac = new AbortController();
  let n = 0;
  try {
    for (const p of paths) {
      if (state.ac.signal.aborted) break;
      const name = p.path.split(/[\\/]/).pop();
      showProgress(true, `${n + 1}/${paths.length} ${name}`, Math.round((n / paths.length) * 100));
      try { const bytes = await bridge.readFile(p.path); await ingest(name, p.size ?? bytes.length, bytes, { path: p.path, truncated: (p.size || 0) > MAX_READ }); }
      catch (err) { if (err.name === 'AbortError') break; state.reports.push({ rec: { name, size: p.size || 0, daw: 'Unknown', container: 'unreadable', confidence: 'low', notes: [`Could not analyze file: ${err.message}`], members: 0 }, findings: [], media: [] }); }
      n++;
      if (n % 10 === 0) recompute();
    }
  } finally { showProgress(false); state.ac = null; }
  recompute();
}

/* ---------- rendering ---------- */
const STATUS_LABEL = { matched: 'matched', possible: 'possible match', missing: 'not found', unknown: 'inventory not supplied' };

function renderVerdict() {
  const v = computeVerdict(state.findings, { inventoryLoaded: state.inventory.length > 0, media: state.media });
  const el = $('#verdict');
  el.className = `verdict ${v.level}`;
  const label = { ready: 'Ready', attention: 'Check', blocked: 'Blocked', unknown: 'Info' }[v.level];
  el.innerHTML = `<strong><span class="vicon">${label}</span>${esc(v.headline)}</strong>${v.details.length ? `<ul>${v.details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}`;
  state.verdict = v;
  return v;
}

function render() {
  const f = state.findings, real = f.filter(x => x.kind !== 'stock');
  const daws = new Set(state.reports.map(r => r.rec.daw).filter(x => x !== 'Unknown')).size;
  const cells = [['FILES', state.reports.length], ['DAWS', daws], ['REFERENCES', real.reduce((n, x) => n + x.occurrences, 0)], ['UNIQUE PLUGINS', real.length], ['HIGH CONF.', real.filter(x => x.confidence === 'high').length], ['MATCHED', real.filter(x => x.installed.status === 'matched').length]];
  $('#summary').innerHTML = cells.map(([l, v]) => `<div class="stat"><strong>${v}</strong><span>${l}</span></div>`).join('');
  const v = renderVerdict();
  if (v.level !== 'ready' && $('#problemsOnly') && !state.problemsTouched && state.inventory.length && v.level !== 'unknown') $('#problemsOnly').checked = true;
  $('#riskBanner').textContent = state.reports.some(r => /binary|unknown/i.test(r.rec.container) && r.rec.parser === 'legacy-strings') ? 'One or more files use proprietary/opaque binary storage, so those results are heuristic.' : '';
  $('#riskBanner').classList.toggle('hidden', !$('#riskBanner').textContent);
  renderFiles(); populateFormats(); renderPlugins(); renderMedia(); renderCompat(); renderStats(); renderFun(); renderDiff();
}

function populateFormats() {
  const sel = $('#formatFilter'), cur = sel.value;
  sel.innerHTML = '<option value="">All formats</option>' + [...new Set(state.findings.map(f => f.format))].sort().map(x => `<option>${esc(x)}</option>`).join('');
  sel.value = cur;
}

function renderFiles() {
  $('#fileList').innerHTML = state.reports.map(({ rec: f }) => `<div class="file-card"><strong>${esc(f.name)}</strong><span>${esc(f.daw)} · ${esc(f.container)} · ${humanBytes(f.size)} · ${esc(f.parser || 'legacy-strings')} · ${esc(f.confidence)} confidence${f.members ? ` · ${f.members} members` : ''}</span>${(f.notes || []).map(n => `<p>${esc(n)}</p>`).join('')}${f.truncated ? '<p><b>Warning:</b> file was truncated for scanning.</p>' : ''}</div>`).join('') || '<p>No files scanned.</p>';
}

function wishlist() { return new Set(getSettings().wishlist || []); }

function renderPlugins() {
  const q = $('#search').value.toLowerCase(), ff = $('#formatFilter').value, cf = $('#confidenceFilter').value, inf = $('#installedFilter').value;
  const showLow = $('#lowConfidence').checked, problems = $('#problemsOnly').checked, stock = $('#showStock').checked, wl = wishlist();
  const list = state.findings.filter(f => (stock || f.kind !== 'stock') && (showLow || f.confidence !== 'low') && (!problems || isProblem(f))
    && (!q || `${f.name} ${f.vendor} ${f.category}`.toLowerCase().includes(q)) && (!ff || f.format === ff) && (!cf || f.confidence === cf) && (!inf || f.installed.status === inf));
  $('#pluginList').innerHTML = list.map(f => {
    const st = f.kind === 'stock' ? 'stock' : f.installed.status;
    return `<article class="plugin"><div class="plugin-main"><div class="plugin-name"><strong>${esc(f.name)}</strong><span>${esc(f.vendor)}</span></div><div class="plugin-cell">${esc(f.kind === 'stock' ? 'Built-in · ' : '')}${esc(f.category)}</div><div class="plugin-cell">${esc(f.format)}</div><div><span class="pill ${esc(f.confidence)}">${esc(f.confidence)}</span></div><div><span class="pill ${esc(st)}">${esc(st === 'stock' ? 'built-in' : STATUS_LABEL[st])}</span>${f.price ? ` <span class="pill">${esc(f.price)}</span>` : ''}</div></div>
<details><summary>Explain &amp; show evidence</summary><p>${esc(f.explanation)}</p><p><b>Occurrences:</b> ${f.occurrences} &nbsp; <b>Sources:</b> ${esc(f.sources.join(', '))}${f.tracks.length ? `<br><b>Tracks:</b> ${esc(f.tracks.join(', '))}` : ''}${f.pluginId ? `<br><b>Plugin ID:</b> ${esc(f.pluginId.type)} ${esc(f.pluginId.value)}` : ''}${f.installed.match ? `<br><b>Inventory match:</b> ${esc(f.installed.match)} (${esc(f.installed.via)})` : ''}</p>${$('#keepEvidence').checked ? `<pre class="evidence">${esc(f.evidence.join('\n\n'))}</pre>` : ''}${f.kind !== 'stock' ? `<button class="button outline" type="button" data-wish="${esc(keyOf(f))}">${wl.has(keyOf(f)) ? '★ On wishlist' : '☆ Add to wishlist'}</button>` : ''}</details></article>`;
  }).join('') || '<p class="privacy-note">No plugins match the current filters.</p>';
}

function renderMedia() {
  const panel = $('#panel-media');
  panel.classList.toggle('hidden', !state.media.length);
  if (!state.media.length) return;
  const s = summarizeMedia(state.media), onlyMissing = $('#mediaProblems').checked;
  $('#mediaSummary').textContent = s.unchecked === s.total ? `${s.total} referenced files. Choose the project folder to check them.` : `${s.total} referenced: ${s.present} found, ${s.possible} possible (same file name), ${s.missing} missing${s.unchecked ? `, ${s.unchecked} unchecked` : ''}.`;
  $('#mediaList').innerHTML = state.media.filter(m => !onlyMissing || m.status === 'missing' || m.status === 'possible' || s.unchecked === s.total).slice(0, 500).map(m => `<div><span class="pill ${m.status === 'present' ? 'matched' : m.status === 'missing' ? 'missing' : m.status === 'possible' ? 'possible' : 'unknown'}">${esc(m.status)}</span> ${esc(m.path)}${m.occurrences > 1 ? ` ×${m.occurrences}` : ''}</div>`).join('');
}

function renderCompat() {
  const real = state.findings.filter(f => f.kind !== 'stock');
  $('#panel-compat').classList.toggle('hidden', !real.length);
  if (!real.length) return;
  const rows = real.map(f => ({ f, c: checkCompat(f, state.target, f.dbId ? db.get(f.dbId) : null) }));
  const sum = summarizeCompat(rows.map(r => r.c));
  $('#compatSummary').textContent = `${sum.headline}${sum.unknown ? ` · ${sum.unknown} unknown` : ''}${sum.unavailable ? ` · ${sum.unavailable} unavailable` : ''}${sum['format-swap'] ? ` · ${sum['format-swap']} need another format` : ''}`;
  $('#compatList').innerHTML = rows.map(({ f, c }) => {
    const alts = ['unavailable', 'format-swap'].includes(c.status) || ['missing', 'possible'].includes(f.installed.status) ? suggestAlternatives(f, db, state.target) : [];
    const cls = { ok: 'matched', caution: 'possible', 'format-swap': 'possible', unavailable: 'missing', unknown: 'unknown' }[c.status];
    return `<div><span class="pill ${cls}">${esc(c.status)}</span> <strong>${esc(f.name)}</strong> <span>${esc(c.reason)}</span>${alts.length ? `<span> Similar (not identical; settings will not transfer): ${alts.map(a => esc(`${a.name} (${a.reason})`)).join('; ')}</span>` : ''}</div>`;
  }).join('');
}

function renderStats() {
  const panel = $('#panel-stats');
  panel.classList.toggle('hidden', state.reports.length < 2);
  if (state.reports.length < 2) return;
  const reps = state.reports.map(r => ({ name: r.rec.name, daw: r.rec.daw, plugins: matchInventory(r.findings, state.inventory, { db }) }));
  const s = computeStats(reps), max = s.plugins[0]?.projects || 1;
  const bars = (title, rows) => `<h3>${esc(title)}</h3>` + rows.map(([k, n]) => `<div><span class="bar" style="width:${Math.max(2, Math.round((n / (rows[0][1] || 1)) * 160))}px"></span> ${esc(k)} <b>${n}</b></div>`).join('');
  const unused = state.inventory.length ? unusedInstalled(state.inventory.map(i => (typeof i === 'string' ? i : i.path)), reps).length : null;
  $('#statsOut').innerHTML = `<p>${s.projects} projects, ${s.plugins.length} distinct plugins.${unused !== null ? ` ${unused} installed plugins were not used in any scanned project.` : ''}</p>`
    + `<h3>Most used plugins</h3>` + s.plugins.slice(0, 15).map(p => `<div><span class="bar" style="width:${Math.max(2, Math.round((p.projects / max) * 160))}px"></span> ${esc(p.name)} <b>${p.projects}</b> project${p.projects === 1 ? '' : 's'}, ${p.instances} instances</div>`).join('')
    + bars('By vendor', s.byVendor) + bars('By category', s.byCategory) + bars('By format', s.byFormat) + bars('By DAW', s.byDaw);
  state.stats = s;
}

function renderFun() {
  const lines = personality(state.findings);
  $('#personality').innerHTML = lines.map(l => `<li>${esc(l)}</li>`).join('');
  const todo = state.findings.filter(f => f.kind !== 'stock' && ['missing', 'possible'].includes(f.installed.status)).sort((a, b) => ({ free: 0, freemium: 1, paid: 2 }[a.price] ?? 3) - ({ free: 0, freemium: 1, paid: 2 }[b.price] ?? 3) || a.name.localeCompare(b.name));
  const done = new Set(getSettings().wizardDone || []);
  $('#wizard').innerHTML = todo.length ? todo.map(f => `<li><label><input type="checkbox" data-wiz="${esc(keyOf(f))}" ${done.has(keyOf(f)) ? 'checked' : ''}> ${esc(f.name)} ${f.vendor ? `(${esc(f.vendor)})` : ''} ${f.price ? `· ${esc(f.price)}` : ''}</label></li>`).join('') : '<li>Nothing to recover. Load a plugin inventory to check what is missing.</li>';
}

/* ---------- events ---------- */
function exportReport() { return makeReport({ files: state.reports.map(r => r.rec), plugins: state.findings, media: state.media, verdict: state.verdict }); }
const dawName = () => state.reports[0]?.rec.daw || 'DAW';

function reset() {
  state.ac?.abort(); // stop any running ingest before clearing
  const backup = { reports: state.reports, inventory: state.inventory, projectFiles: state.projectFiles };
  state.reports = []; state.findings = []; state.media = []; state.inventory = []; state.projectFiles = [];
  state.snapshot = null; state.diff = null; $('#diffOut').innerHTML = ''; $('#diffMdBtn').classList.add('hidden');
  $('#workspace').classList.add('hidden'); $('#inventoryStatus').textContent = 'No inventory loaded';
  for (const id of ['#fileInput', '#inventoryFolder', '#inventoryFile', '#projectFolder', '#snapFile']) $(id).value = '';
  if (backup.reports.length) toast('Report cleared.', 'Undo', () => {
    state.reports = [...backup.reports, ...state.reports]; // keep anything analysed since the reset
    if (!state.inventory.length) { state.inventory = backup.inventory; $('#inventoryStatus').textContent = `${backup.inventory.length} inventory entries restored`; }
    if (!state.projectFiles.length) state.projectFiles = backup.projectFiles;
    $('#workspace').classList.remove('hidden'); recompute();
  });
}

function setInventory(items, label) {
  state.inventory = items;
  $('#inventoryStatus').textContent = `${items.length} ${label}`;
  recompute();
}

function applyTheme(t) {
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  $('#themeBtn').textContent = `Theme: ${t || 'system'}`;
}

function bind() {
  const drop = $('#dropZone');
  $('#browseBtn').onclick = e => { e.stopPropagation(); $('#fileInput').click(); };
  drop.onclick = () => $('#fileInput').click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') $('#fileInput').click(); };
  $('#fileInput').onchange = e => handleFiles([...e.target.files]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => handleFiles([...e.dataTransfer.files]));
  for (const ev of ['dragover', 'drop']) window.addEventListener(ev, e => e.preventDefault()); // never navigate away on a stray drop
  $('#cancelBtn').onclick = () => state.ac?.abort();

  $('#inventoryFolder').onchange = e => setInventory(pluginPathsFromFiles([...e.target.files].map(f => f.webkitRelativePath || f.name)), 'plugins indexed locally');
  $('#inventoryFile').onchange = async e => { const f = e.target.files[0]; if (f) setInventory(parseInventoryText(await f.text(), f.name), 'inventory entries loaded locally'); };
  $('#projectFolder').onchange = e => { state.projectFiles = [...e.target.files].map(f => f.webkitRelativePath || f.name); recompute(); };

  const saved = getSettings();
  for (const [id, key] of [['#minString', 'minString'], ['#deepScan', 'deepScan'], ['#lowConfidence', 'lowConfidence'], ['#keepEvidence', 'keepEvidence'], ['#problemsOnly', 'problemsOnly'], ['#showStock', 'showStock'], ['#mediaProblems', 'mediaProblems']]) {
    const el = $(id);
    if (saved[key] !== undefined) { if (el.type === 'checkbox') el.checked = !!saved[key]; else el.value = saved[key]; }
    el.addEventListener('input', () => { setSetting(key, el.type === 'checkbox' ? el.checked : el.value); if (key === 'problemsOnly') state.problemsTouched = true; });
  }
  ['search', 'formatFilter', 'confidenceFilter', 'installedFilter', 'keepEvidence', 'lowConfidence', 'problemsOnly', 'showStock'].forEach(id => $('#' + id).addEventListener('input', renderPlugins));
  $('#mediaProblems').addEventListener('input', renderMedia);

  state.target = { os: saved.targetOs || 'win', arch: saved.targetArch || 'x64' };
  $('#targetOs').value = state.target.os; $('#targetArch').value = state.target.arch;
  for (const [id, k, sk] of [['#targetOs', 'os', 'targetOs'], ['#targetArch', 'arch', 'targetArch']]) $(id).addEventListener('input', e => { state.target[k] = e.target.value; setSetting(sk, e.target.value); renderCompat(); });

  const themes = [null, 'dark', 'light'];
  let ti = Math.max(0, themes.indexOf(saved.theme || null));
  applyTheme(themes[ti]);
  $('#themeBtn').onclick = () => { ti = (ti + 1) % themes.length; setSetting('theme', themes[ti]); applyTheme(themes[ti]); };
  $('#confLegend').title = 'high = read from structured project data with a plugin ID; medium = structured name only or a clear text reference; low = found by scanning text in an opaque file.';

  $('#resetBtn').onclick = reset;
  $('#copyBtn').onclick = () => navigator.clipboard?.writeText(makeTextReport(state.reports.map(r => r.rec), state.findings));
  document.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    const t = b.dataset.export;
    if (t === 'json') download('pluginchek-report.json', JSON.stringify(exportReport(), null, 2), 'application/json');
    if (t === 'csv') download('pluginchek-plugins.csv', makeCsvReport(state.findings), 'text/csv');
    if (t === 'txt') download('pluginchek-report.txt', makeTextReport(state.reports.map(r => r.rec), state.findings));
    if (t === 'recovery') download('pluginchek-recovery-checklist.txt', makeRecoveryChecklist(state.findings));
  });

  $('#mediaCsvBtn').onclick = () => download('pluginchek-media.csv', makeMediaCsv(state.media), 'text/csv');
  $('#statsCsvBtn').onclick = () => state.stats && download('pluginchek-stats.csv', statsCsv(state.stats), 'text/csv');
  $('#snapBtn').onclick = () => download('pluginchek-snapshot.json', JSON.stringify(exportReport(), null, 2), 'application/json');
  $('#snapFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { state.snapshot = migrateV1ToV2(JSON.parse(await f.text())); renderDiff(); } catch (err) { $('#diffOut').textContent = `Could not read snapshot: ${err.message}`; }
    e.target.value = '';
  };
  $('#diffMdBtn').onclick = () => state.diff && download('pluginchek-diff.md', compareMarkdown(state.diff, 'snapshot', 'current'));

  document.querySelectorAll('[data-share]').forEach(b => b.onclick = () => {
    const o = { daw: dawName(), redact: $('#redact').checked };
    if (b.dataset.share === 'html') download('pluginchek-needed-plugins.html', makeShareHtml(state.findings, o), 'text/html');
    if (b.dataset.share === 'md') download('pluginchek-needed-plugins.md', makeShareMarkdown(state.findings, o), 'text/markdown');
    if (b.dataset.share === 'print') printHtml(makeShareHtml(state.findings, o));
  });
  $('#cardBtn').onclick = async () => { const blob = await makeProjectCard(state.findings, dawName(), personality(state.findings)); if (blob) download('pluginchek-card.png', blob); };
  $('#wishBtn').onclick = () => { const wl = wishlist(); download('pluginchek-wishlist.json', JSON.stringify(state.findings.filter(f => wl.has(keyOf(f))).map(f => ({ name: f.name, vendor: f.vendor, price: f.price })), null, 2), 'application/json'); };
  document.addEventListener('change', e => {
    if (e.target.dataset?.wiz) { const s = new Set(getSettings().wizardDone || []); e.target.checked ? s.add(e.target.dataset.wiz) : s.delete(e.target.dataset.wiz); setSetting('wizardDone', [...s]); }
  });
  document.addEventListener('click', e => {
    const k = e.target.dataset?.wish; if (!k) return;
    const s = wishlist(); s.has(k) ? s.delete(k) : s.add(k); setSetting('wishlist', [...s]); renderPlugins();
  });

  if (bridge) {
    $('#scanPcBtn').classList.remove('hidden'); $('#batchBtn').classList.remove('hidden');
    $('#scanPcBtn').onclick = async () => {
      $('#inventoryStatus').textContent = 'Scanning installed plugins…';
      const r = await bridge.scanInventory();
      setInventory(r.items, `installed plugins found${r.notes?.length ? ` (${r.notes.length} folders skipped)` : ''}${r.truncated ? ' — scan limit reached, results may be incomplete' : ''}`);
    };
    $('#batchBtn').onclick = async e => { e.stopPropagation(); const dir = await bridge.pickFolder(); if (dir) { const files = await bridge.listProjects(dir); if (files.length) handlePaths(files); else toast('No project files found in that folder.'); } };
    bridge.onOpenFiles?.(async paths => handlePaths(await Promise.all(paths.map(async p => ({ path: p })))));
  }
}

function renderDiff() {
  if (!state.snapshot) return;
  const d = comparePlugins(state.snapshot.plugins, state.findings);
  state.diff = d;
  const row = (tag, cls, f, extra = '') => `<div><span class="pill ${cls}">${tag}</span> ${esc(f.name)} ${f.vendor ? `(${esc(f.vendor)})` : ''} ${esc(extra)}</div>`;
  $('#diffOut').innerHTML = `<p>${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed, ${d.unchanged.length} unchanged.</p>`
    + d.added.map(f => row('added', 'matched', f)).join('') + d.removed.map(f => row('removed', 'missing', f)).join('')
    + d.changed.map(c => row('changed', 'possible', c.a, c.diffs.join('; '))).join('');
  $('#diffMdBtn').classList.remove('hidden');
}

function printHtml(html) {
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;width:0;height:0;border:0';
  fr.srcdoc = html;
  fr.onload = () => { try { fr.contentWindow.print(); } finally { setTimeout(() => fr.remove(), 2000); } };
  document.body.append(fr);
}

bind();
window.__pluginchek = { state, ingest, recompute, handleFiles }; // test hook; contains no network capability
