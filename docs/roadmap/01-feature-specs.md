# PluginChek — Developer Feature Specs

Conventions: **MUST/SHOULD/MAY** per RFC 2119. "AC" = acceptance criteria (each becomes ≥1 test). Effort in ideal dev-days (S≤2, M≤5, L≤10). Dependencies refer to feature IDs. Flag = key in `config/features.js`.
Anything marked **VERIFY** is an assumption about a file format that MUST be confirmed against real fixture files before coding against it.

---
## Shared data model (Phase 0, `src/core/schema.js`) — SCHEMA_VERSION = 2
```js
/** @typedef {'VST2'|'VST3'|'AU'|'AAX'|'CLAP'|'Unknown'} PluginFormat */
/** @typedef {'high'|'medium'|'low'} Confidence */
/**
 * @typedef {Object} PluginId   // strongest identifier available
 * @property {'vst2-fourcc'|'vst3-cid'|'au-triple'|'clap-id'|'aax-id'} type
 * @property {string} value     // vst2: 4-char code or int; vst3: 32 hex chars uppercase; au: "type/subtype/manufacturer"; clap: reverse-DNS id
 */
/**
 * @typedef {Object} Finding
 * @property {string} id            // stable hash of (pluginId.value || normalised name + vendor)
 * @property {string} name          // display name, normalised (arch/format suffix removed)
 * @property {string} vendor        // '' if unknown
 * @property {PluginFormat} format
 * @property {PluginId|null} pluginId
 * @property {'plugin'|'stock'} kind // stock = DAW built-in device
 * @property {string} category      // controlled vocabulary, see F3
 * @property {Confidence} confidence
 * @property {string[]} evidence    // <=500 chars each, max 5 kept
 * @property {string[]} sources     // file (› member path)
 * @property {number} occurrences
 * @property {string} daw
 * @property {Installed} installed
 * @property {string|null} dbId     // F3 plugin database id when matched
 */
/** @typedef {{status:'unknown'|'matched'|'possible'|'missing', match:string|null, via:'id'|'name'|'fuzzy'|null}} Installed */
/**
 * @typedef {Object} MediaRef  // F2
 * @property {'audio'|'sample'|'preset'|'other'} kind
 * @property {string} path @property {string} resolvedPath|null
 * @property {'present'|'missing'|'unchecked'} status
 * @property {string} source @property {number} occurrences
 */
/** @typedef {{schema:2, generated:string, app:string, files:FileRec[], plugins:Finding[], media:MediaRef[], verdict:Verdict|null}} Report */
```
AC: `validateFinding/validateReport` throw descriptive errors; JSON export always includes `schema`; a `migrateV1ToV2()` accepts old exports.
Old field mapping: `installedStatus 'not found'→missing`, `'possible match'→possible`, `'inventory not supplied'→unknown`.

---
## F13a — Foundation refactor & test harness (Phase 0, effort M, BLOCKS ALL)
**Goal:** modular layout (see plan §3), zero behaviour change, CI on PRs, fixtures folder, flags, mount points.
**Requirements**
1. Split `parser-core.js` into `core/*` and `parsers/legacy-strings.js` without changing output; keep `parser-core.js` as re-export shim.
2. Rewrite `app.js` into `ui/main.js`, `ui/store.js`, panels; readable formatting (no one-line files); keep all element IDs used by tests/E2E.
3. Add `.github/workflows/ci.yml` (PR + push): Node 22, `npm ci`, `npm test`, `npm run check`, ESLint (flat config, `no-unused-vars`, `eqeqeq`), Prettier check.
4. Add `config/features.js`, mount points in `index.html`, CSP meta, `tests/fixtures/README.md`, `npm run fixtures:update`.
5. Move analysis into a **Web Worker** (`core/worker.js`) with message protocol `{type:'analyze', file, opts}` → `{type:'progress'|'result'|'error'}`; main thread keeps a synchronous fallback when `Worker` is unavailable (tests).
**AC:** all 13 existing unit tests pass unchanged; the E2E sample (REAPER file → 2 plugins) passes; `git diff` of exports before/after on the sample set is identical except `schema`; lint+format clean; desktop app still loads under `app://` (`ALLOWED` set in `desktop/main.js` updated for new files — **use a directory allowlist, not per-file**, and reject `..` after decoding).
**Edge cases:** module imports must use explicit `.js` extensions; Worker path must resolve under `app://`.

---
## F1 — Structured project parsers (effort L; flag `parsers.structured`)
**Goal:** replace guessing with structural parsing and extract plugin IDs. Phase 1a: Ableton `.als`, REAPER `.rpp`/`.rpp-bak`. Phase 1b (separate PRs, best effort): Bitwig, Studio One, FL Studio, Cubase/Nuendo, Logic, Pro Tools, Reason.
**Interface** (`src/parsers/index.js`):
```js
{ id:'ableton', canParse(fileName, bytes) => boolean|number /*score*/, 
  async parse(bytes, ctx) => { findings:Finding[], media:MediaRef[], notes:string[], meta:{version?:string, tracks?:number} } }
```
Registry picks highest score; ties → first. If parse throws or returns 0 findings and file is non-empty → run `legacy-strings` and add note "Structured parse failed: <reason>; used string scan (low confidence)".
### F1.ALS — Ableton Live
- Input: gzip→XML (stream-decompress with cap 512 MB; reject if ratio >200:1 with a note).
- Parse with a **small tolerant XML tokenizer** (no DOM; `DOMParser` unavailable in Node/Worker consistently) that yields elements/attributes `Value="…"`. Zero dependencies; ≤250 lines; handle CDATA/entities/BOM.
- Extract (**VERIFY** names against real fixtures from Live 10, 11, 12): `PluginDevice` → `PluginDesc` → one of `VstPluginInfo` (`PlugName`, `UniqueId`, `Manufacturer`), `Vst3PluginInfo` (`Name`, `Uid` fields→CID), `AuPluginInfo` (`Name`, `Manufacturer`, `ComponentType/SubType/Manufacturer`). Track name from the enclosing `AudioTrack|MidiTrack|ReturnTrack|MasterTrack|GroupTrack` → `EffectiveName`.
- Stock devices (`Compressor2`, `Eq8`, …): `kind:'stock'`, hidden by default (UI toggle in F11), name from element tag mapped via a table.
- Record `meta.version` from root `Creator` attribute.
### F1.RPP — REAPER
- Line-oriented tokenizer honouring quotes (`"`, `'`, backtick), nested `<…` / `>` blocks, base64 state blocks (skip contents, never decode).
- `<VST "VST3: Name (Vendor)" file 0 "" id …` → format from prefix, vendor from parenthesis, file name, **ID parsing VERIFY** (REAPER stores a numeric/`{GUID}`-style id; decode CID/fourcc). `<AU`, `<JS "path"` (kind `stock`/`js`), `<CLAP`.
- Track context: nearest `<TRACK` `NAME`; FX bypass flag (first ints after file) → `evidence` note "bypassed" (do not drop the finding).
### Confidence rules
`high` = structural node with pluginId; `medium` = structural node with name only; `low` = string scan. Merge (`core/merge.js`) MUST key on `pluginId` when present, else normalised `name+vendor`; never merge two different pluginIds even with same name; merge keeps the highest confidence and unions evidence (cap 5).
### AC
1. Each fixture parses to its `expected.json` exactly (names, vendors, formats, ids, counts).
2. A project with the same plugin on 5 tracks → 1 finding, `occurrences:5`, sources list tracks.
3. Corrupted/truncated/empty inputs and a gzip bomb never throw, never exceed 5 s/512 MB; fall back to legacy with note.
4. 20 MB `.als` parses in <3 s (Worker).
5. Duplicates bug regression: `FabFilter Pro-Q 3` + filename form produce 1 finding.
**Risks:** version drift of XML names — fixtures from ≥3 DAW versions required before flag-on.

---
## F2 — Missing media detection (effort M; depends F1.ALS/RPP; flag `media`)
**Goal:** list referenced audio/sample/preset files and whether they exist.
**Extraction:** ALS `SampleRef/FileRef` (`Path`, `RelativePath`, `OriginalFileSize`), `RelativePathType`; RPP `<SOURCE WAVE` `FILE "…"` (relative to project dir). **VERIFY** both.
**Resolution:** browser can't read arbitrary disk paths. Provide "Select project folder" (`webkitdirectory`) → build a `Map<lowercasedBasename+size, path>`; match order: exact relative path → basename+size → basename only (`possible`). Desktop (F4 channel) may stat absolute paths directly via IPC `fs:exists(paths[])` (batched, main process, returns booleans only; never file contents).
**Output:** `MediaRef[]`, UI panel `panel-media`: counts, grouped by folder, filter missing, export CSV (`path,kind,status,source`). Treat paths as untrusted text (escape, CSV neutralise).
**AC:** fixture with 3 samples (1 missing) → 1 `missing`; relative paths with `../` and Windows `\` handled; 10 000 refs render <200 ms (virtualised list); no path ever leaves the machine; works with no folder chosen (status `unchecked`, with prompt).

---
## F3 — Plugin database (effort L data + M code; flag `db`)
**Files:** `data/plugins.json` (+ `data/schema.json`), `core/db.js`.
```jsonc
{ "version": 12, "updated": "2026-10-01",
  "plugins": [{ "id":"fabfilter-pro-q-3", "name":"Pro-Q 3", "vendor":"FabFilter",
    "aliases":["FabFilter Pro-Q 3","Pro-Q3"], "ids":[{"type":"vst3-cid","value":"…"},{"type":"vst2-fourcc","value":"FQ3p"}],
    "formats":["VST2","VST3","AU","AAX","CLAP"], "platforms":{"win":true,"mac":true,"linux":false,"arm":true},
    "category":"EQ", "tags":["dynamic-eq"], "price":"paid", "summary":"…", "links":[{"kind":"vendor","url":"https://…"}],
    "alternatives":["tdr-nova","…"], "stock": false }],
  "categories":["EQ","Compressor","Limiter","Reverb","Delay","Distortion / Saturation","Instrument / Synth","Sampler / Instrument","Drum Instrument","Amp / Guitar","Pitch / Time","Modulation","Utility","Analyzer","Unknown"] }
```
**Lookup order** (`db.lookup(finding)`): pluginId exact → alias exact (normalised key) → vendor+name token match (≥2 tokens) → `null`. Returns `{entry, via}`; enrichment never overwrites a parsed vendor with a conflicting one.
**Loading:** bundled snapshot always; background `fetch` of hosted JSON (hash-checked, `version` newer only, cached in IndexedDB/`localStorage` guarded with try/catch); failure silently keeps snapshot. Replace the hard-coded `KB` regex array.
**Data process (small-tier model + human review):** seed from the existing 40 KB entries → top ~500 plugins by usage → grow. Every entry needs ≥1 source URL in a `sources.md`; CI script `npm run db:validate` checks schema, duplicate ids/aliases, URL syntax (https only), category vocabulary, alias collisions across entries.
**AC:** all current KB test expectations still pass via the DB; ID-based match beats name match; invalid DB rejected with fallback to snapshot; DB with 5 000 entries looks up 1 000 findings in <50 ms (prebuilt alias Map); links rendered only if `https:`.

---
## F4 — Installed plugin scanner & inventory (desktop; effort L; depends Phase 0; flag `inventory.scan`)
**Goal:** one-click "scan this computer".
**Scan roots (configurable, user can add):**
- Win: `C:\Program Files\Common Files\VST3`, `…\CLAP`, `C:\Program Files\VSTPlugIns`, `C:\Program Files\Steinberg\VSTPlugins`, `%LOCALAPPDATA%\Programs\Common\VST3`.
- macOS: `/Library/Audio/Plug-Ins/{VST,VST3,Components,CLAP}`, `~/Library/Audio/Plug-Ins/…`.
- Linux: `~/.vst3`, `/usr/lib/vst3`, `/usr/local/lib/vst3`, `~/.clap`, `/usr/lib/clap`, `~/.vst`, `/usr/lib/lxvst`.
**Implementation:** main process `desktop/scanner.js` walks roots (depth ≤4, skip symlink loops, cap 50 000 entries) → emits `{path, format, name, bundleId?, mtime}`. Metadata where cheap: VST3 `moduleinfo.json` (Contents/moduleinfo.json — contains CID, vendor, name; **VERIFY**), macOS `Info.plist` / AU `AudioComponents`, CLAP via filename only in v1. Do **not** load/execute plugin binaries (security, crashes).
**IPC:** `contextBridge` preload exposes `pluginchek.scanInventory(roots)`, `pluginchek.pickFolder()`; channels allow-listed; renderer remains `sandbox:true`, `nodeIntegration:false`.
**Matching (`features/inventory-match.js`, pure, also used by web with manual folder):** match by ID → exact normalised name → alias via DB → fuzzy (token Jaccard ≥0.8, labelled `possible`). Replace the current substring matcher that can mis-match `Pro-Q` vs `Pro-Q 3` vs `Pro-QR`.
**AC:** unit tests with synthetic directory trees per OS (virtual fs injected); symlink loop terminates; 5 000-plugin scan <5 s; permission-denied folders are skipped with a note; cancel button aborts within 500 ms; no plugin file is read beyond metadata; web build keeps current manual flow.

---
## F5 — Verdict summary & "problems only" filter (effort S; depends F1/F4 optional; flag `verdict`)
`features/verdict.js`: `computeVerdict(report) → {level:'ready'|'attention'|'blocked'|'unknown', counts:{total,matched,possible,missing,stock,lowConfidence}, headline, details[]}`.
Rules: no inventory → `unknown`, headline "Found N plugins. Load your installed plugins to see what's missing." Else `blocked` if any `missing` with confidence ≥ medium; `attention` if only `possible`/low-confidence; else `ready`. Headline text templates localisable (string table). Show free/paid split for missing when DB provides `price`.
UI: top banner (`panel-verdict`), colour + icon + text (not colour alone), "Show only problems" toggle (default on when level≠ready), counts clickable to filter.
AC: table-driven tests over all level branches; wording never claims "missing" without an inventory; screen reader announces banner (`role="status"`).

---
## F6 — Cross-platform compatibility check (effort M; depends F3; flag `compat`)
Input: finding (+DB `formats`, `platforms`), target `{os:'win'|'mac'|'linux', arch:'x64'|'arm64', formats[] preferred}`. Output per plugin: `ok | format-swap | unavailable | unknown` with reason ("AU not available on Windows; VST3 exists", "No Linux build", "Intel-only, runs via Rosetta"). Project-level summary: "12/14 ready for Apple Silicon". Target selector persists (guarded storage). Unknown DB data → `unknown`, never `unavailable`.
AC: matrix tests (AU on Windows, AAX anywhere without Pro Tools, VST2 on Apple Silicon note, CLAP-only plugin); unknown DB entries handled; selector change re-renders without re-parsing.

---
## F7 — Alternatives & substitutes (effort S–M; depends F3; flag `alternatives`)
For each `missing`/`possible` plugin: up to 3 suggestions from DB `alternatives` filtered by target platform (F6), sorted free → cheap → paid, same category required. Show reason ("free dynamic EQ"). Clearly labelled "similar, not identical — settings will not transfer". Optional links only `https:`; affiliate links MUST be labelled and are disabled by default (decision in plan §7).
AC: no suggestion of the same plugin; filtered by platform; empty state when none; includes stock-device equivalents (e.g. "Ableton EQ Eight") when the DAW is known.

---
## F8 — Shareable "what you need" package (effort M; depends F5; flag `share`)
Exports: (a) self-contained HTML page (inline CSS, no JS, no external requests) listing needed plugins with vendor links; (b) Markdown; (c) printable PDF via browser print stylesheet. Optional redaction: strip file paths, track names, project name (checkbox, default on). Includes generation date, DAW, report schema version, disclaimer.
AC: HTML opens offline; all user strings escaped; redaction removes every path/track string (test searches output for fixture path tokens); output <200 KB for 200 plugins.

---
## F9 — Project comparison (effort M; depends F1 merge keys; flag `compare`)
Input: two reports A,B (two files, or one file's earlier snapshot). Match by `pluginId` → else normalised name+vendor. Output: `added`, `removed`, `changed` (format/version/vendor), `unchanged`, plus `occurrences` delta. UI: two-column diff, filters, export CSV/Markdown. Snapshot save/load = JSON report files (no hidden storage).
AC: symmetric swap test (A,B ↔ B,A inverts added/removed); same-ID different-name = `changed`; 500-plugin diff <100 ms; imports v1 reports through migration.

---
## F10 — Batch scanning & usage statistics (effort L; desktop first; depends F1, F5; flag `batch`)
Desktop: choose folder → recursive discovery of known project extensions (+ skip `Backup/`, `.asd`) → queue (concurrency = min(4, cores-1) Workers) with per-file progress, cancel, resumable (cache by path+mtime+size in app data JSON). Web: multi-file drop only (no recursion).
Stats (`features/stats.js`): plugin frequency (projects containing, total instances), vendor/category/format breakdown, "never used in last N projects" when inventory is loaded, DAW split, orphan/unused installed plugins, timeline by file mtime. Charts: dependency-free inline SVG (bar, donut, heat grid), accessible tables beneath each.
AC: 1 000 small projects scanned without UI jank (>30 fps) and <512 MB RAM; cancel stops within 1 s; one corrupt file doesn't stop the batch; stats unit-tested against a synthetic corpus; CSV/JSON export.

---
## F11 — Usability set (effort M; flag per item)
1. **Progress & cancel** (Worker messages; determinate for gzip/zip, indeterminate for strings); remove the silent 80 MB cap → streaming read; if cap still applies, show a visible warning chip, not just a note.
2. **Persisted settings** (min string length, deep scan, filters, theme, target platform, hidden-stock toggle) in one guarded `settings.js` with schema version + reset button.
3. **Stock-device handling:** toggle "Show DAW built-in devices" (default off) with counts.
4. **Confidence explainer:** inline popover per level ("Structured data: read directly from the project" etc.) + legend.
5. **Desktop file association & drag-onto-icon:** electron-builder `fileAssociations` for supported extensions; `open-file` (macOS) and `process.argv` (Win/Linux) → `pluginchek.onOpenFiles`; single-instance lock to route into the running window.
6. **Keyboard & a11y:** full tab order, visible focus, ARIA live status, table headers/scope, colour contrast ≥4.5:1, `prefers-reduced-motion`.
7. **Empty/error states** with next-step guidance; undo for Reset (10 s toast).
AC: each item has an E2E assertion; axe-core run in E2E reports zero serious/critical violations; cancel returns UI to idle state.

---
## F12 — Fun/desirability set (effort M total; flag `fun`; ship after Phase 3)
1. **Project card:** canvas/SVG 1200×630 PNG (DAW, plugin count, top vendors, signature plugin, no file names). Local generation, `Save PNG` / `Copy`. No network.
2. **Stack personality:** rule-based text from stats (`features/personality.js`), e.g. ≥3 reverbs → "Reverb enthusiast". Deterministic, unit-tested, ≤12 rules, tone friendly, never negative about users.
3. **Wishlist:** star missing/paid plugins; stored in exportable JSON; shows total est. cost when DB has `price`/`priceUsd` (optional field).
4. **Themes:** dark/light/system + 1–2 accent palettes via CSS variables.
5. **Recovery wizard:** step list ordered free → paid, "mark done", progress bar; reuses `makeRecoveryChecklist` data.
AC: card PNG is byte-stable for fixed input (seeded); personality rules covered by table tests; wizard state survives reload (guarded storage).

---
## F13b — Release engineering (effort M–L; start in parallel, lane D)
1. **Signing:** Windows (Azure Trusted Signing or EV/OV cert via secrets `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`); macOS (Developer ID + notarisation via `notarytool`, entitlements minimal); Linux AppImage checksum + optional GPG signature. Never commit secrets; use GitHub Environments with required reviewers for release jobs.
2. **macOS build:** add `macos-latest` matrix entry, `dist:mac` (dmg + zip, universal or arm64+x64).
3. **Auto-update:** `electron-updater` against GitHub Releases, user-controlled ("Check for updates" + opt-in auto), signature verified, update channel `beta`/`stable`. No telemetry.
4. **Electron hardening checklist:** `sandbox`, `contextIsolation`, `webSecurity`, deny `will-navigate`/new windows (done), CSP header via `session.webRequest`, `setPermissionRequestHandler` deny-all, no `remote`, `enableBlinkFeatures` none, Electron version pinned and bumped monthly (Dependabot).
5. **Release notes** generated from conventional commits; `SHA256SUMS.txt` attached.
6. **Crash-safe logging** to local file only; "Copy diagnostics" button (versions, flags; no project data).
AC: signed binary verifies (`signtool verify`, `spctl`, `codesign -dv`); update from N-1 → N works in a VM; tags produce a prerelease with all artifacts and checksums; Dependabot + `npm audit --omit=dev` gate in CI.

---
## Cross-cutting test matrix
| Layer | Tooling | Runs in CI |
|---|---|---|
| Unit | `node --test` (+coverage) | PR |
| Golden fixtures | `tests/fixtures/**` + `expected.json` | PR |
| Fuzz/limits | seeded mutator, 5 s/512 MB guard | PR (short), nightly (long) |
| E2E web | Playwright Chromium | PR |
| E2E desktop smoke | Playwright-Electron under `xvfb-run` (Linux), native on Win/macOS | release/nightly |
| Accessibility | axe-core in E2E | PR |
| Security | XSS payload test, CSV injection, path traversal on `app://` handler, `npm audit` | PR |
| Perf | benchmark script with threshold | nightly |
