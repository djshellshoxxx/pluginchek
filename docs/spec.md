# PluginChek Browser Application Specification

## Product goal
PluginChek is a privacy-first browser utility for inspecting saved DAW projects and sessions. A user drops one or more project files into the page and receives a structured report describing the DAW/file type, every plugin reference that can be recovered, plugin format/vendor/category clues, repeated instances, raw evidence, confidence, compatibility risks, and whether referenced plugins appear in an optional local plugin inventory.

The application is a static GitHub Pages site. Project data never needs to leave the browser.

## Design constraints
- Static HTML/CSS/JavaScript, deployable from GitHub Pages with no backend.
- Match the Circuit Drift Lab visual identity: #0E1116 base, #171B22 surfaces, #2A303A edges, #E8532A orange primary accent, #4FB6C4 teal secondary accent, Inter/system sans and JetBrains/IBM mono styling.
- Link prominently back to the Circuit Drift Lab home page.
- Work on current desktop Chromium, Firefox, and Safari where browser APIs permit. Degrade gracefully.
- Never claim exact decoding when only heuristic evidence exists. Every result carries a confidence/evidence description.
- Local-only by default. No analytics, uploads, tracking pixels, external APIs, or remote AI calls.

## Input model
The primary drop zone accepts one or multiple files. The tool supports individual project files, project archives, and ZIPs of package/directory-based projects. A second input accepts files from plugin directories using `webkitdirectory` where supported, plus plain text/CSV inventory exports.

Recognized DAW families include at minimum:
- Ableton Live `.als` (gzip/XML)
- REAPER `.rpp` and `.rpp-bak` (text)
- FL Studio `.flp` (binary heuristic)
- Studio One `.song` (ZIP/container inspection)
- Bitwig Studio `.bwproject` (container/binary inspection)
- Cubase/Nuendo `.cpr` / `.npr` (binary heuristic)
- Pro Tools `.ptx` / `.pts` (binary heuristic)
- Logic Pro `.logicx` and GarageBand `.band` when supplied as archives/packages
- Reason `.reason`
- generic XML, JSON, ZIP, gzip, text and unknown binary files

## Analysis pipeline
1. Identify the likely DAW and container from extension plus magic bytes.
2. Decode gzip where applicable.
3. Parse ZIP central directories and inflate stored/deflated textual members without sending data off-device.
4. Extract textual material from XML/JSON/text members and printable strings from binary data.
5. Run format-aware plugin detectors first, then generic plugin/signature detectors.
6. Normalize candidate plugin names/vendors/formats, merge duplicate evidence, and count occurrences.
7. Enrich recognized names with a local knowledge base describing likely category and purpose.
8. Compare normalized references to an optional local installed-plugin inventory.
9. Produce project summary, plugin table, confidence/risk flags, raw evidence and exportable reports.

## Plugin result fields
Each recovered plugin should expose, when available:
- display name
- manufacturer/vendor
- plugin format: VST2, VST3, AU, AAX, CLAP, native/unknown
- category: EQ, compressor, limiter, reverb, delay, distortion/saturation, instrument/synth, sampler, dynamics, modulation, utility, analyzer, pitch/time, channel strip, unknown
- short plain-language explanation
- instance/evidence count
- likely installed status: matched, possible match, not found, inventory not supplied
- confidence: high, medium, low
- exact evidence strings and source file/member
- identifiers encountered, such as VST3 class IDs, four-character Audio Unit codes, vendor IDs or paths, when recoverable
- version/build hints when present in project strings

## Interface
### Header
Circuit Drift Lab wordmark treatment, PluginChek name, LOCAL ANALYSIS indicator, link back to Circuit Drift Lab and GitHub repository.

### Intake
Large drag/drop target with Browse Files button, accepted-format helper text, local-processing statement and scan mode selector. Advanced options include printable-string minimum length, deep archive scan, deduplication, low-confidence candidates and raw-evidence capture.

### Installed plugin comparison
Optional folder picker and inventory-file picker. Normalize `.vst3`, `.vst`, `.component`, `.aaxplugin`, `.clap`, `.dll` and filenames/paths for fuzzy comparison.

### Summary dashboard
Cards for project files, likely DAWs, plugin references, unique plugins, high-confidence findings, inventory matches and unresolved references. Risk banner explains unsupported/opaque areas.

### Results explorer
Searchable/filterable/sortable table. Filters for DAW, plugin format, category, confidence and installed state. Expandable rows show explanation, identifiers, evidence, raw strings and match rationale.

### File inspector
Per-file cards show filename, size, detected DAW/container, confidence, parsed archive members and scan notes. A strings/evidence viewer is available for troubleshooting.

### Reports
- Export JSON with complete machine-readable analysis.
- Export CSV with one row per normalized plugin.
- Export human-readable TXT report.
- Copy summary to clipboard.
- Reset all local state.

## Safety, privacy and resilience
- Files are read with File/ArrayBuffer APIs only and are not uploaded.
- Large files are capped for expensive printable-string extraction while retaining metadata and clear truncation notes.
- Invalid/truncated gzip/ZIP members do not fail the whole project scan.
- HTML from project files is never inserted unsanitized into the DOM.
- Parsing errors are surfaced per file/member.
- Low-confidence candidates remain visually distinct from confirmed references.

## Accuracy model
PluginChek cannot promise complete semantic parsing of every DAW/version because several project formats are proprietary binary formats and can change without public schemas. Exact parsers are used where practical; heuristic scanners are fallback evidence collectors. The UI must state the analysis mode and confidence for every result.

## Accessibility and responsive behavior
- Keyboard operable controls and visible focus states.
- Proper labels, live status announcements and semantic tables/details.
- Mobile/tablet layout remains readable, though desktop is the primary analysis surface.
- Reduced-motion preference disables decorative animation.

## Acceptance criteria
- A REAPER project containing recognizable VST/AU lines returns normalized plugins with high-confidence evidence.
- An Ableton `.als` can be decompressed client-side and inspected.
- Unknown binary files return useful printable-string/plugin candidates without crashing and label them heuristic.
- Multiple files can be scanned together and results deduplicate while preserving occurrence/evidence counts.
- Optional plugin-directory files affect installed/missing status without any upload.
- JSON, CSV and text exports contain the analyzed results.
- No network call is required to analyze a project.
- Site visually matches Circuit Drift Lab and contains a working return link.
