# Implementation status (v0.1.0-beta.2)

Legend: ✅ done and tested · 🟡 done with a stated limitation · ⏳ not done.
"Tested" means unit/fixture tests (`npm test`, 48) and the browser E2E (`node scripts/e2e.mjs`). **All parser fixtures are synthetic** (written from the documented layouts); real anonymised projects are still needed before the "VERIFY" assumptions in the specs can be trusted.

| ID | Feature | Status | Notes / deviations from spec |
|---|---|---|---|
| F13a | Foundation | 🟡 | Modular `src/` layout, schema v2, feature registries, CI on PRs, fixtures folder. **Not done:** Web Worker (analysis runs on the main thread with progress + cancel between stages), ESLint/Prettier (replaced by `scripts/check-syntax.mjs`), feature-flag file (features ship enabled), `parser-core.js` kept as the legacy fallback module rather than a shim. |
| F1 | Structured parsers | 🟡 | Ableton `.als` and REAPER `.rpp` ✅ (plugin IDs, tracks, stock devices, media). FL Studio, Cubase, Pro Tools, Logic, Studio One, Bitwig, Reason still use the string scan (low confidence). REAPER bypass flag not captured. A structured parse that finds nothing is reported as empty rather than falling back to the string scan. |
| F2 | Missing media | ✅ | Web: choose the project folder. Desktop: existence check on absolute/relative paths. UNC/network paths are deliberately never checked (credential-leak guard). Matching is path, then file name (reported as "possible"); file size is not compared. |
| F3 | Plugin database | 🟡 | 44 curated entries bundled in `src/data/plugins-snapshot.js` (`npm run check` validates it). **No remote update** (kept offline on purpose), **no plugin IDs yet** (`ids` empty, so ID lookup is exercised only by tests), no `formats`/`links`, `arm` platform flag unset. Growing the data is the main remaining task. |
| F4 | Installed-plugin scanner | 🟡 | Desktop "Scan this computer" over standard VST3/CLAP/VST2/AU/AAX folders, VST3 `moduleinfo.json` IDs (VERIFY), symlink-loop and cap safe. `.dll` files are all treated as VST2, so support DLLs can appear. Web keeps the folder picker (now macOS/Linux bundle aware). |
| F5 | Verdict + problems filter | ✅ | Never says "missing" without an inventory; missing media blocks "ready". |
| F6 | Compatibility check | 🟡 | Format/OS rules complete; Apple-Silicon check is dormant until DB entries carry `arm` data. |
| F7 | Alternatives | ✅ | From DB `alternatives`; free first; platform filtered. No affiliate links. |
| F8 | Share package | ✅ | HTML / Markdown / print; redaction toggle controls the Tracks column. |
| F9 | Compare | ✅ | Snapshot save/load, diff, Markdown export. |
| F10 | Batch + stats | 🟡 | Desktop folder scan (sequential, cancellable), stats panel with CSV. No result cache, no worker concurrency; charts are simple bars. |
| F11 | Usability | 🟡 | Progress/cancel, persisted settings, stock toggle, theme, confidence tooltip, file association for `.als`/`.rpp`, single-instance, undo for reset. **Not done:** axe-core accessibility run, virtualised long lists, streaming read (files over 400 MB are truncated with a visible warning). |
| F12 | Fun set | ✅ | Project card PNG, stack personality, wishlist, wizard, themes. |
| F13b | Release engineering | 🟡 | Workflow builds Windows/Linux/macOS, checksums, CSP, sandbox, permission deny, IPC allow-lists. **Not done:** code signing/notarisation, auto-update, crash log, Dependabot is configured but untested. |

## Security audit (two passes)
Independent review found and I fixed: quadratic regex/XML scanning (hostile project could freeze the tab), zip-bomb output budgets, a UNC-path credential-leak vector in the desktop existence check, spreadsheet-formula injection in the stats CSV, over-confident matches on opaque binaries, and several UI state bugs (concurrent opens, reset/undo, stale diff, macOS open-file race, bundle plugin folders on macOS/Linux). Each has a regression test in `tests/pipeline.test.mjs` ("audit:" tests).

## Needed next (cannot be done without you)
1. Real anonymised `.als` / `.rpp` files (and other DAWs) to replace the synthetic fixtures and confirm element names.
2. Code-signing certificates (Windows) and an Apple Developer account.
3. A run of the Windows build on a real Windows machine: the portable `.exe` was cross-built on Linux (`npm run dist:win:portable`) and has **not been executed**. The Windows installer (NSIS) needs Wine on Linux, so it is produced only by the `Desktop beta build` workflow on a Windows runner (not yet run).
