import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectProjectType,
  extractPrintableStrings,
  analyzeTextForPlugins,
  mergePluginFindings,
  matchInventory,
  makeCsvReport,
  parseInventoryText,
  makeRecoveryChecklist,
} from '../parser-core.js';

test('detects common DAW project types by extension', () => {
  assert.equal(detectProjectType('set.als').daw, 'Ableton Live');
  assert.equal(detectProjectType('mix.rpp').daw, 'REAPER');
  assert.equal(detectProjectType('beat.flp').daw, 'FL Studio');
  assert.equal(detectProjectType('session.ptx').daw, 'Pro Tools');
  assert.equal(detectProjectType('project.cpr').daw, 'Cubase / Nuendo');
});

test('extracts readable strings from binary input', () => {
  const bytes = new Uint8Array([0, 1, ...Buffer.from('FabFilter Pro-Q 3'), 0, ...Buffer.from('VST3'), 0]);
  const strings = extractPrintableStrings(bytes, 5);
  assert.ok(strings.includes('FabFilter Pro-Q 3'));
  assert.ok(strings.includes('VST3'));
});

test('finds and enriches recognizable plugin references in project text', () => {
  const text = '<VST "VST3: FabFilter Pro-Q 3 (FabFilter)" preset="x"/>\nVST: ValhallaVintageVerb (Valhalla DSP)';
  const findings = analyzeTextForPlugins(text, { source: 'mix.rpp', daw: 'REAPER' });
  const proQ = findings.find(x => /Pro-Q 3/i.test(x.name));
  const valhalla = findings.find(x => /Valhalla/i.test(x.name));
  assert.ok(proQ);
  assert.equal(proQ.vendor, 'FabFilter');
  assert.equal(proQ.category, 'EQ');
  assert.ok(valhalla);
  assert.equal(valhalla.category, 'Reverb');
});

test('merges duplicate plugin evidence while preserving occurrence count', () => {
  const merged = mergePluginFindings([
    { name: 'FabFilter Pro-Q 3', vendor: 'FabFilter', format: 'VST3', confidence: 'high', evidence: ['a'] },
    { name: 'FabFilter Pro Q 3', vendor: 'FabFilter', format: 'VST3', confidence: 'medium', evidence: ['b'] },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].occurrences, 2);
  assert.deepEqual(new Set(merged[0].evidence), new Set(['a', 'b']));
});

test('matches project plugins against inventory filenames', () => {
  const findings = mergePluginFindings([{ name: 'FabFilter Pro-Q 3', vendor: 'FabFilter', format: 'VST3', confidence: 'high', evidence: [] }]);
  const matched = matchInventory(findings, ['C:/Program Files/Common Files/VST3/FabFilter Pro-Q 3.vst3']);
  assert.equal(matched[0].installedStatus, 'matched');
});

test('CSV report quotes values and includes key columns', () => {
  const csv = makeCsvReport([{ name: 'Test, Plugin', vendor: 'ACME', format: 'VST3', category: 'Utility', confidence: 'high', occurrences: 2, installedStatus: 'matched', explanation: 'Does things.' }]);
  assert.match(csv, /Name,Vendor,Format,Category,Confidence,Occurrences,Installed,Explanation/);
  assert.match(csv, /"Test, Plugin"/);
});

test('does not double-count the same structured plugin evidence line', () => {
  const text = '<VST "VST3: FabFilter Pro-Q 3 (FabFilter)" preset="x"/>';
  const merged = mergePluginFindings(analyzeTextForPlugins(text, { source: 'mix.rpp', daw: 'REAPER' }));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'FabFilter Pro-Q 3');
  assert.equal(merged[0].occurrences, 1);
  assert.equal(merged[0].evidence.length, 1);
});

test('does not use unsafe substring matching for short inventory names', () => {
  const matched = matchInventory([{ name: 'EQ', format: 'VST3' }], ['C:/Plugins/SuperEQ.vst3']);
  assert.equal(matched[0].installedStatus, 'not found');
});

test('parses JSON inventory arrays as paths rather than JSON syntax fragments', () => {
  assert.deepEqual(
    parseInventoryText('["C:/VST3/FabFilter Pro-Q 3.vst3", "C:/VST3/Serum.vst3"]', 'plugins.json'),
    ['C:/VST3/FabFilter Pro-Q 3.vst3', 'C:/VST3/Serum.vst3']
  );
});

test('builds a recovery checklist containing missing and possible matches only', () => {
  const text = makeRecoveryChecklist([
    { name: 'Missing Synth', vendor: 'ACME', format: 'VST3', installedStatus: 'not found', sources: ['song.rpp'] },
    { name: 'Maybe Verb', vendor: 'ACME', format: 'AU', installedStatus: 'possible match', inventoryMatch: '/Library/Audio/MaybeVerb.component', sources: ['song.rpp'] },
    { name: 'Present EQ', vendor: 'ACME', format: 'VST3', installedStatus: 'matched', sources: ['song.rpp'] },
  ]);
  assert.match(text, /Missing Synth/);
  assert.match(text, /Maybe Verb/);
  assert.doesNotMatch(text, /Present EQ/);
  assert.match(text, /1 missing/);
  assert.match(text, /1 possible match/);
});
