import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { analyzeBytes } from '../src/core/pipeline.js';
import { mergeFindings } from '../src/core/merge.js';
import { migrateV1ToV2, validateReport, validateFinding, makeReport, normalizeFinding } from '../src/core/schema.js';
import { createDb, validateDb, defaultDb } from '../src/core/db.js';
import { matchInventory } from '../src/core/inventory.js';
import { resolveMedia, summarizeMedia, makeMediaCsv } from '../src/features/media.js';
import { computeVerdict, isProblem } from '../src/features/verdict.js';
import { checkCompat, summarizeCompat } from '../src/features/compat.js';
import { suggestAlternatives } from '../src/features/alternatives.js';
import { comparePlugins } from '../src/features/compare.js';
import { computeStats, unusedInstalled } from '../src/features/stats.js';
import { personality } from '../src/features/personality.js';
import { makeShareHtml, makeShareMarkdown } from '../src/features/share.js';
import { splitTokens, parseDisplay } from '../src/parsers/reaper.js';
import { scanXml } from '../src/core/xml.js';
import { SNAPSHOT } from '../src/data/plugins-snapshot.js';

const fx = p => readFileSync(new URL(`./fixtures/${p}`, import.meta.url));
const als = () => gzipSync(fx('ableton/basic.als.xml'));
const run = (name, bytes, opts) => analyzeBytes(name, bytes.length, new Uint8Array(bytes), opts);
const names = r => r.findings.map(f => f.name);

test('ableton: structured parse of gzip .als', async () => {
  const r = await run('basic.als', als());
  assert.equal(r.rec.parser, 'ableton');
  const byName = Object.fromEntries(r.findings.map(f => [f.name, f]));
  assert.equal(byName['Pro-Q 3'].format, 'VST3');
  assert.equal(byName['Pro-Q 3'].pluginId.type, 'vst3-cid');
  assert.equal(byName['Pro-Q 3'].pluginId.value, '00000001000000020000000300000004');
  assert.equal(byName['Pro-Q 3'].vendor, 'FabFilter');
  assert.equal(byName['Pro-Q 3'].confidence, 'high');
  assert.equal(byName.Serum.occurrences, 2);
  assert.deepEqual(byName.Serum.tracks.sort(), ['Bass', 'Lead']);
  assert.equal(byName.Serum.pluginId.value, '1484571501');
  assert.equal(byName.AUDelay.format, 'AU');
  assert.equal(byName.AUDelay.confidence, 'medium');
  assert.equal(byName['EQ Eight'].kind, 'stock');
  assert.equal(r.findings.length, 4);
});

test('ableton: media references extracted', async () => {
  const r = await run('basic.als', als());
  assert.equal(r.media.length, 1);
  assert.equal(r.media[0].relPath, 'Samples/Imported/vocal.wav');
  assert.equal(r.media[0].absPath, '/Users/me/Project/Samples/Imported/vocal.wav');
});

test('reaper: structured parse with ids, JS and media', async () => {
  const r = await run('basic.rpp', fx('reaper/basic.rpp'));
  assert.equal(r.rec.parser, 'reaper');
  const byName = Object.fromEntries(r.findings.map(f => [f.name, f]));
  assert.equal(byName['Pro-Q 3'].pluginId.value, 'AAAABBBBCCCCDDDDEEEEFFFF00001111');
  assert.equal(byName['Pro-Q 3'].vendor, 'FabFilter');
  assert.equal(byName['Pro-Q 3'].tracks[0], 'Guitar');
  assert.equal(byName.ReaComp.pluginId.type, 'vst2-fourcc');
  assert.equal(byName['Volume Adjustment'].kind, 'stock');
  assert.equal(r.findings.length, 3);
  assert.equal(r.media[0].relPath, 'Media/guitar take 1.wav');
});

test('reaper helpers', () => {
  assert.deepEqual(splitTokens('<VST "a b" c.dll 0'), ['<VST', 'a b', 'c.dll', '0']);
  assert.deepEqual(parseDisplay('VSTi: Serum (Xfer Records) (16 out)'), { fmt: 'VST2', name: 'Serum', vendor: 'Xfer Records' });
  assert.equal(parseDisplay('nonsense'), null);
});

test('xml scanner: entities, comments, self-closing, limits', () => {
  const seen = [];
  scanXml('<?xml?><!-- c --><A x="a&amp;b"><B/><![CDATA[<C>]]></A>', { open: (t, a) => seen.push([t, a.x]) });
  assert.deepEqual(seen, [['A', 'a&b'], ['B', undefined]]);
  assert.throws(() => scanXml('<a><a><a>', { maxDepth: 2 }), /depth/);
});

test('robustness: empty, truncated, corrupt, wrong-extension inputs never throw', async () => {
  const good = als();
  const cases = [new Uint8Array(0), good.subarray(0, 40), good.subarray(0, good.length - 10), new Uint8Array(5000).fill(0xff), new TextEncoder().encode('<Ableton><PluginDevice'), new Uint8Array(1000).map((_, i) => (i * 31) & 255)];
  for (const [i, c] of cases.entries()) for (const n of ['x.als', 'x.rpp', 'x.flp', 'x.zip', 'x.bin']) {
    const r = await analyzeBytes(n, c.length, c);
    assert.ok(Array.isArray(r.findings), `case ${i} ${n}`);
  }
});

test('robustness: decompression bomb is rejected and falls back safely', async () => {
  const bomb = gzipSync(Buffer.alloc(20_000_000));
  const r = await run('bomb.als', bomb, { maxDecompressed: 1_000_000 });
  assert.ok(r.rec.notes.some(n => /exceeds/.test(n)));
});

test('cancellation via AbortSignal', async () => {
  const ac = new AbortController(); ac.abort();
  await assert.rejects(() => run('basic.als', als(), { signal: ac.signal }), /cancelled/i);
});

test('merge: same ID merges, different IDs never merge, ID-less adopts into ID finding', () => {
  const mk = (name, id, extra = {}) => ({ name, pluginId: id ? { type: 'vst3-cid', value: id } : null, format: 'VST3', confidence: 'low', ...extra });
  assert.equal(mergeFindings([mk('A', 'X'), mk('A', 'X')]).length, 1);
  assert.equal(mergeFindings([mk('A', 'X'), mk('A', 'Y')]).length, 2);
  const m = mergeFindings([mk('Pro Q', null, { confidence: 'low' }), mk('Pro Q', 'Z', { confidence: 'high' })]);
  assert.equal(m.length, 1); assert.equal(m[0].occurrences, 2); assert.equal(m[0].confidence, 'high');
});

test('regression: filename + display name + arch suffix yield one plugin', async () => {
  const t = '<VST "VST3: Pro-Q 3 (FabFilter)" FabFilter_Pro-Q_3.vst3 0\n<VST "VST: Serum (Xfer Records)" Serum_x64.dll 0';
  const r = await run('legacy.txt', new TextEncoder().encode(t));
  assert.equal(r.findings.length, 2, names(r).join('|'));
});

test('schema: validate, migrate v1, report shape', () => {
  const v1 = { files: [], plugins: [{ name: 'X', vendor: 'Unknown', format: 'VST2 / VST', category: 'Unknown', confidence: 'low', occurrences: 1, installedStatus: 'not found', evidence: [], sources: [] }] };
  const v2 = migrateV1ToV2(v1);
  assert.equal(v2.schema, 2); assert.equal(v2.plugins[0].installed.status, 'missing'); assert.equal(v2.plugins[0].format, 'VST2');
  validateReport(v2);
  assert.throws(() => validateFinding({ name: 'x', format: 'bad', confidence: 'high', occurrences: 1 }), /format/);
  assert.equal(makeReport().schema, 2);
});

test('db: valid snapshot, lookup by name/alias, parsed vendor never overwritten, invalid rejected', () => {
  assert.deepEqual(validateDb(SNAPSHOT), []);
  const e = defaultDb.enrich(normalizeFinding({ name: 'FabFilter Pro-Q 3', vendor: '' }));
  assert.equal(e.dbId, 'fabfilter-pro-q'); assert.equal(e.vendor, 'FabFilter');
  const kept = defaultDb.enrich(normalizeFinding({ name: 'Pro-Q 3', vendor: 'My Vendor' }));
  assert.equal(kept.vendor, 'My Vendor');
  assert.throws(() => createDb({ plugins: [{ id: 'a', name: 'A', category: 'Nope' }] }), /Invalid/);
  assert.ok(validateDb({ plugins: [{ id: 'a', name: 'A', category: 'EQ', links: [{ url: 'http://x' }] }] }).some(m => /non-https/.test(m)));
  assert.ok(defaultDb.lookup({ name: 'Unknown Thing', vendor: '' }) === null);
});

test('db: 1000 lookups are fast', () => {
  const t = Date.now();
  for (let i = 0; i < 1000; i++) defaultDb.lookup({ name: i % 2 ? 'Serum' : `Nope ${i}`, vendor: '' });
  assert.ok(Date.now() - t < 200);
});

const F = (name, o = {}) => normalizeFinding({ name, format: 'VST3', confidence: 'high', ...o });

test('inventory: id, exact, vendor-prefix, db alias, fuzzy, missing, unknown', () => {
  const inv = [{ path: '/v/FabFilter Pro-Q 3.vst3' }, { path: '/v/Serum_x64.dll' }, { path: '/v/Big Reverb Deluxe.vst3' }, { path: '/v/Other.vst3', ids: [{ type: 'vst3-cid', value: 'ABC' }] }];
  const res = matchInventory([F('Pro-Q 3', { vendor: 'FabFilter' }), F('Serum'), F('Big Reverb Deluxe 2'), F('Renamed', { pluginId: { type: 'vst3-cid', value: 'ABC' } }), F('Nothing Here')], inv, { db: defaultDb });
  const s = res.map(f => `${f.installed.status}:${f.installed.via}`);
  assert.deepEqual(s, ['matched:name', 'matched:name', 'possible:fuzzy', 'matched:id', 'missing:null']);
  assert.equal(matchInventory([F('X')], [])[0].installed.status, 'unknown');
});

test('inventory: Pro-Q is not an exact match for Pro-QR', () => {
  assert.notEqual(matchInventory([F('Pro-Q')], [{ path: '/v/Pro-QR.vst3' }])[0].installed.status, 'matched');
});

test('media: resolve present / possible / missing / unchecked, CSV neutralised', () => {
  const m = [{ kind: 'audio', path: 'Samples/a.wav', relPath: 'Samples/a.wav', status: 'unchecked', source: 's', occurrences: 1 }, { kind: 'audio', path: 'x/b.wav', relPath: '../x/b.wav', status: 'unchecked', source: 's', occurrences: 1 }, { kind: 'audio', path: '=cmd', relPath: '', status: 'unchecked', source: 's', occurrences: 1 }];
  assert.ok(resolveMedia(m, []).every(x => x.status === 'unchecked'));
  const r = resolveMedia(m, ['Proj/Samples/a.wav', 'Proj/other/b.wav']);
  assert.deepEqual(r.map(x => x.status), ['present', 'possible', 'missing']);
  assert.equal(summarizeMedia(r).missing, 1);
  assert.ok(makeMediaCsv(r).includes("'=cmd"));
});

test('verdict: all levels, never says missing without inventory', () => {
  const inst = (st, o = {}) => ({ ...F('P' + st + Math.random(), o), installed: { status: st } });
  assert.equal(computeVerdict([], {}).level, 'unknown');
  const noInv = computeVerdict([inst('unknown')], { inventoryLoaded: false });
  assert.equal(noInv.level, 'unknown'); assert.ok(!/missing\b/.test(noInv.headline.replace('what is missing', '')));
  assert.equal(computeVerdict([inst('matched')], { inventoryLoaded: true }).level, 'ready');
  assert.equal(computeVerdict([inst('possible')], { inventoryLoaded: true }).level, 'attention');
  const b = computeVerdict([inst('missing', { price: 'free' }), inst('matched')], { inventoryLoaded: true });
  assert.equal(b.level, 'blocked'); assert.equal(b.counts.missingFree, 1);
  assert.ok(isProblem(inst('missing'))); assert.ok(!isProblem({ ...inst('missing'), kind: 'stock' }));
});

test('compat matrix', () => {
  const win = { os: 'win', arch: 'x64' }, arm = { os: 'mac', arch: 'arm64' };
  assert.equal(checkCompat(F('x', { format: 'AU' }), win).status, 'format-swap');
  assert.equal(checkCompat(F('x', { format: 'AU' }), win, { formats: ['AU'], platforms: {} }).status, 'unavailable');
  assert.equal(checkCompat(F('x', { format: 'AAX' }), win).status, 'format-swap');
  assert.equal(checkCompat(F('x', { format: 'VST2' }), arm).status, 'caution');
  assert.equal(checkCompat(F('x'), win, { platforms: { win: false } }).status, 'unavailable');
  assert.equal(checkCompat(F('x'), arm, { platforms: { mac: true, arm: false } }).status, 'caution');
  assert.equal(checkCompat(F('x'), win).status, 'unknown');
  assert.equal(checkCompat(F('x'), win, { platforms: { win: true } }).status, 'ok');
  assert.equal(checkCompat({ ...F('x'), kind: 'stock' }, win).status, 'ok');
  assert.equal(summarizeCompat([{ status: 'ok' }, { status: 'unknown' }, { status: 'caution' }, { status: 'unavailable' }, { status: 'format-swap' }]).ready, 2);
});

test('alternatives: free first, same category, platform-filtered, never itself', () => {
  const f = defaultDb.enrich(F('Pro-Q 3'));
  const alts = suggestAlternatives(f, defaultDb, { os: 'linux', arch: 'x64' });
  assert.ok(alts.length >= 1 && alts.length <= 3);
  assert.ok(alts.every(a => a.id !== f.dbId));
  assert.equal(alts[0].price, 'free');
  assert.deepEqual(suggestAlternatives(F('Totally Unknown'), defaultDb), []);
});

test('compare: added / removed / changed, symmetry', () => {
  const A = [F('A'), F('B'), F('C', { format: 'VST2' })], B = [F('B'), F('C', { format: 'VST3' }), F('D')];
  const d = comparePlugins(A, B), r = comparePlugins(B, A);
  assert.deepEqual([d.added.map(f => f.name), d.removed.map(f => f.name), d.changed.length, d.unchanged.length], [['D'], ['A'], 1, 1]);
  assert.deepEqual([r.added.map(f => f.name), r.removed.map(f => f.name)], [['A'], ['D']]);
});

test('stats and unused installed', () => {
  const reports = [{ daw: 'REAPER', plugins: [F('A', { vendor: 'V', occurrences: 2, installed: { match: '/p/A' } }), F('B')] }, { daw: 'Ableton Live', plugins: [F('A', { vendor: 'V' })] }];
  const s = computeStats(reports);
  assert.equal(s.plugins[0].name, 'A'); assert.equal(s.plugins[0].projects, 2); assert.equal(s.plugins[0].instances, 3);
  assert.equal(s.byDaw.length, 2);
  assert.deepEqual(unusedInstalled(['/p/A', '/p/Z'], reports.map(r => ({ plugins: r.plugins.map(p => ({ ...p, installed: p.installed })) }))), ['/p/Z']);
});

test('personality is deterministic and friendly', () => {
  const many = Array.from({ length: 4 }, (_, i) => F('R' + i, { category: 'Reverb', vendor: 'V' }));
  assert.deepEqual(personality(many), personality(many));
  assert.ok(personality(many).some(l => /Reverb enthusiast/.test(l)));
  assert.equal(personality([]).length, 1);
});

test('share: HTML/Markdown escape hostile names and redact tracks/paths', () => {
  const evil = F('<img src=x onerror=alert(1)>', { tracks: ['SECRET_TRACK'], sources: ['/home/me/secret/path.als'] });
  const html = makeShareHtml([evil], { daw: 'REAPER' });
  assert.ok(!html.includes('<img') && !html.includes('SECRET_TRACK') && !html.includes('secret/path') && !/<script/i.test(html));
  const md = makeShareMarkdown([F('a|b')], {});
  assert.ok(md.includes('a\\|b'));
});

import { resolveAppPath } from '../desktop/paths.js';
import { defaultRoots, scanPlugins, listProjects } from '../desktop/scanner.js';

test('desktop: app:// path resolver blocks traversal and unlisted files', () => {
  const root = '/app';
  assert.equal(resolveAppPath(root, '/'), '/app/index.html');
  assert.equal(resolveAppPath(root, '/src/ui/main.js'), '/app/src/ui/main.js');
  for (const bad of ['/../etc/passwd', '/src/../package.json', '/%2e%2e/secret', '/src/%2e%2e/x.js', '/package.json', '/desktop/main.js', '/src/a\\b.js', '/%00', '/%E0%A4%A']) assert.equal(resolveAppPath(root, bad), null, bad);
});

test('desktop: default plugin roots per OS', () => {
  assert.ok(defaultRoots('win32', { ProgramFiles: 'C:\\PF', LOCALAPPDATA: 'C:\\L' }, 'C:\\U').some(r => /VST3$/.test(r)));
  assert.ok(defaultRoots('darwin', {}, '/Users/u').some(r => r === '/Users/u/Library/Audio/Plug-Ins/VST3'));
  assert.ok(defaultRoots('linux', {}, '/home/u').includes('/home/u/.vst3'));
});

function virtualFs(tree) { // tree: {'/root': [['A.vst3','dir'],['B.dll','file'],['sub','dir']], ...}
  const ent = (name, kind) => ({ name, isFile: () => kind === 'file', isDirectory: () => kind === 'dir', isSymbolicLink: () => false });
  return {
    realpath: async p => { if (!(p in tree)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return tree.__links?.[p] || p; },
    readdir: async p => { if (tree.__denied?.includes(p)) throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); return (tree[p] || []).map(([n, k]) => ent(n, k)); },
    readFile: async () => { throw new Error('no'); }, stat: async () => ({ size: 10 }),
  };
}

test('desktop scanner: finds plugins, survives loops, denied folders and missing roots', async () => {
  const fsx = virtualFs({ '/r': [['A.vst3', 'dir'], ['B.dll', 'file'], ['x.txt', 'file'], ['loop', 'dir']], '/r/loop': [['again', 'dir'], ['Z.clap', 'file']], '/r/loop/again': [], '/r/A.vst3': [], '/den': [['Q.vst3', 'dir']], __denied: ['/den'], __links: { '/r/loop/again': '/r' } });
  const res = await scanPlugins(['/r', '/den', '/missing'], { fsx });
  assert.deepEqual(res.items.map(i => `${i.name}:${i.format}`).sort(), ['A:VST3', 'B:VST2', 'Z:CLAP']);
  assert.ok(res.notes.some(n => /EACCES/.test(n)));
  const cancelled = await scanPlugins(['/r'], { fsx, signal: { aborted: true } });
  assert.equal(cancelled.items.length, 0);
  const capped = await scanPlugins(['/r'], { fsx, maxEntries: 1 });
  assert.ok(capped.truncated);
});

test('desktop: project listing filters by extension', async () => {
  const fsx = virtualFs({ '/p': [['a.als', 'file'], ['b.txt', 'file'], ['Backup', 'dir'], ['sub', 'dir']], '/p/sub': [['c.rpp', 'file']], '/p/Backup': [['d.als', 'file']] });
  assert.deepEqual((await listProjects('/p', { fsx })).map(x => x.path.split('/').pop()).sort(), ['a.als', 'c.rpp']);
});

// ---------- audit regressions ----------
import { deflateRawSync } from 'node:zlib';
import { unzipTextEntries } from '../src/core/zip.js';
import { candidatePaths, isUnsafePath } from '../src/features/media.js';
import { pluginPathsFromFiles } from '../src/core/inventory.js';
import { statsCsv } from '../src/features/stats.js';
import { analyzeTextForPlugins } from '../parser-core.js';

const timed = fn => { const t = Date.now(); fn(); return Date.now() - t; };

test('audit: XML scanner is linear on unterminated comment/PI/CDATA floods', () => {
  for (const s of ['<?', '<!--', '<![CDATA[', '<a ', '<a b="', '<!']) assert.ok(timed(() => scanXml(s.repeat(100_000), {})) < 500, s);
  const seen = [];
  scanXml('<a x=">"><b/></a>', { open: t => seen.push(t) });
  assert.deepEqual(seen, ['a', 'b']); // '>' inside a quoted attribute value is handled
});

test('audit: REAPER display parsing and legacy VST regex are linear on hostile lines', async () => {
  assert.ok(timed(() => parseDisplay('VST: x' + ' '.repeat(200_000) + '(a)')) < 500);
  assert.ok(timed(() => parseDisplay('VST: ' + '('.repeat(200_000))) < 500);
  assert.ok(timed(() => analyzeTextForPlugins('<VST'.repeat(100_000), { source: 's', daw: 'x', confidence: 'low' })) < 1500);
  assert.deepEqual(parseDisplay('VST3: Pro-Q 3 (FabFilter)'), { fmt: 'VST3', name: 'Pro-Q 3', vendor: 'FabFilter' });
});

function zipWith(entries, { overlap = false } = {}) {
  const locals = [], centrals = [];
  let off = 0;
  for (const [name, data] of entries) {
    const comp = deflateRawSync(data), nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(overlap ? 0 : off, 42);
    centrals.push(Buffer.concat([ch, nm]));
    if (!overlap || locals.length === 0) { locals.push(Buffer.concat([lh, nm, comp])); off += lh.length + nm.length + comp.length; }
  }
  const cd = Buffer.concat(centrals), eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eo]));
}

test('audit: zip reader rejects overlapping entries, enforces total budget, honours abort', async () => {
  const data = Buffer.alloc(2_000_000, 0x41);
  const overlapped = zipWith(Array.from({ length: 20 }, (_, i) => [`m${i}.xml`, data]), { overlap: true });
  assert.equal((await unzipTextEntries(overlapped)).length, 1);
  const many = zipWith(Array.from({ length: 10 }, (_, i) => [`m${i}.xml`, data]));
  const out = await unzipTextEntries(many, { maxTotalBytes: 5_000_000 });
  assert.ok(out.length >= 1 && out.length <= 3, `got ${out.length}`);
  await assert.rejects(() => unzipTextEntries(many, { signal: { aborted: true } }), /cancelled/i);
});

test('audit: UNC and network paths are never candidates for existence checks', () => {
  assert.ok(isUnsafePath('\\\\attacker\\share\\x.wav') && isUnsafePath('//host/x'));
  const m = [{ absPath: '\\\\attacker\\share\\x.wav', relPath: '' }, { absPath: '', relPath: 'a/b.wav' }, { absPath: '/ok/c.wav', relPath: '' }];
  assert.deepEqual(candidatePaths(m, '/proj'), ['', '/proj/a/b.wav', '/ok/c.wav']);
  assert.deepEqual(candidatePaths([{ absPath: '', relPath: 'a.wav' }], '\\\\srv\\share'), ['']);
});

test('audit: opaque-binary text matches stay low confidence and KB patterns are word-anchored', async () => {
  const bytes = new TextEncoder().encode(['kRxBufferSize', 'Marxism_config', 'CrossFadeWavesPreset_v2', 'Service_Vitality', 'Serum'].map(s => '\0\0\0' + s + '\0\0\0').join(''));
  const r = await analyzeBytes('x.cpr', bytes.length, bytes);
  assert.deepEqual(r.findings.map(f => f.name), ['Serum']);
  assert.equal(r.findings[0].confidence, 'low');
});

test('audit: web folder picker finds bundle plugins on macOS/Linux/Windows', () => {
  const got = pluginPathsFromFiles(['VST3/Foo.vst3/Contents/MacOS/Foo', 'VST3/Foo.vst3/Contents/Info.plist', 'Components/Bar.component/Contents/MacOS/Bar', 'vst3/Baz.vst3/Contents/x86_64-linux/Baz.so', 'W/Qux.dll', 'W\\Old.vst3', 'readme.txt']);
  assert.deepEqual(got.sort(), ['Components/Bar.component', 'VST3/Foo.vst3', 'W/Old.vst3', 'W/Qux.dll', 'vst3/Baz.vst3'].sort());
});

test('audit: verdict is not "ready" with missing media; csv neutralises tab; share redact toggle', () => {
  const ok = { ...F('P'), installed: { status: 'matched' } };
  const v = computeVerdict([ok], { inventoryLoaded: true, media: [{ status: 'missing' }] });
  assert.equal(v.level, 'attention'); assert.match(v.headline, /could not be found/);
  assert.ok(statsCsv({ plugins: [{ name: '\t=1+1', vendor: '', projects: 1, instances: 1 }] }).includes("'\t=1+1"));
  const withTracks = F('Plug', { tracks: ['Lead Vox'] });
  assert.ok(!makeShareHtml([withTracks], { redact: true }).includes('Lead Vox'));
  assert.ok(makeShareHtml([withTracks], { redact: false }).includes('Lead Vox'));
  assert.ok(makeShareMarkdown([withTracks], { redact: false }).includes('Lead Vox'));
});

test('audit: ableton parser survives tag floods inside an .als', async () => {
  const evil = new TextEncoder().encode('<Ableton Creator="x">' + '<!--'.repeat(50_000));
  const t = Date.now();
  const r = await analyzeBytes('evil.als', evil.length, evil);
  assert.ok(Date.now() - t < 2000); assert.ok(Array.isArray(r.findings));
});
