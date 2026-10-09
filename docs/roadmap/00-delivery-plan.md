# PluginChek Roadmap — Delivery Plan

Companion to `01-feature-specs.md`. Read this first. Feature IDs (F1…F13) match the specs.

## 1. Ground rules (apply to every feature)
1. **Privacy invariant:** project contents never leave the machine. No network calls with project data. The only permitted network use is fetching the public plugin database (F3) and optional update checks. Add a test that fails if `fetch`/`XMLHttpRequest` receives project-derived data.
2. **Evidence over claims:** every finding keeps `evidence[]` and a `confidence`. Never upgrade confidence without structural proof (a parsed node, not a regex on free text).
3. **Never throw to the user:** parsers return `{findings, media, notes, errors}`; a failing parser falls back to the legacy string scan and records a note.
4. **Zero runtime dependencies** in the browser build unless a spec says otherwise (keeps the static site simple). Dev dependencies are fine.
5. **Every PR:** `npm test` and `npm run check` green, new tests included, no `app.js` edits except through extension points (see §3).

## 2. Phase order and why
| Phase | Features | Why this order |
|---|---|---|
| 0 Foundation | F13a refactor, schema v2, fixtures, feature flags, mount points | Removes the merge-conflict hot spot (`app.js` is a few very long lines) and gives every later feature its own files. **Nothing else starts until this merges.** |
| 1 Accuracy | F1 parsers, F3 plugin DB, F2 media | Core value; all later features consume their output. F1/F2/F3 touch different files and can run in parallel after Phase 0. |
| 2 Answers | F5 verdict, F4 inventory scan, F11 usability | Needs Phase 1 data. F4 is desktop-only. |
| 3 Differentiators | F6 compatibility, F7 alternatives, F9 compare, F8 share package | Needs F3 data fields and F5 summary. |
| 4 Growth/fun | F10 batch + stats, F12 fun features | Needs everything above stable. |
| 5 Release | F13b signing, auto-update, macOS, a11y pass | Can start in parallel from Phase 1 (accounts/certs have lead time). |

Parallel lanes after Phase 0: **Lane A** F1 (+F2 after F1.ALS). **Lane B** F3 then F7. **Lane C** F11 then F5 then F4. **Lane D** F13b (certs, CI). Four lanes touching disjoint files.

## 3. Architecture to build in Phase 0 (prevents merge conflicts)
```
src/
  core/schema.js        // Finding/Media/Report v2 typedefs + validators (JSDoc), SCHEMA_VERSION
  core/pipeline.js      // analyzeFile(file, opts) -> {rec, findings, media}; picks parser, runs fallback
  core/merge.js         // mergePluginFindings (moved from parser-core.js, now ID-aware)
  parsers/index.js      // registry: [{id, canParse(name, bytes), parse(bytes, ctx)}]
  parsers/legacy-strings.js  // current behaviour, kept as fallback
  parsers/ableton.js, reaper.js, ...   // one file per DAW (F1)
  data/plugins.json     // F3 (separate release cadence)
  features/<name>.js    // pure logic per feature (verdict, compat, alternatives, compare, stats)
  ui/main.js            // bootstraps, owns state
  ui/panels/<name>.js   // each panel exports mount(el, store); registered in ui/panels/index.js
  ui/store.js           // tiny observable store {state, subscribe, set}
config/features.js      // feature flags {verdict:false, compat:false, ...}
tests/fixtures/<daw>/   // small anonymised sample projects + expected.json
tests/*.test.mjs        // one test file per module
desktop/                // Electron main + preload (F4, F10, F11 file-association)
```
- `parser-core.js`, `app.js`, `ui-assistance.js` keep working via thin re-export shims for one release, then are removed.
- `index.html` gets **pre-created mount points** (`<section id="panel-verdict">`, `panel-media`, `panel-compat`, `panel-alternatives`, `panel-compare`, `panel-stats`, `panel-share`) in Phase 0, hidden by default. Features never edit `index.html` afterwards, only their own panel file and a one-line registry entry.
- The registries (`parsers/index.js`, `ui/panels/index.js`, `config/features.js`) are **append-only, one line per feature, alphabetical** so concurrent PRs produce trivial, auto-resolvable merges.
- The ES-module code must run unchanged in the browser, Node (tests) and Electron (`app://` scheme). No `window` access outside `ui/` and no Node APIs outside `desktop/`.

## 4. Git workflow
- Branch per feature: `feat/F1-ableton-parser`; short-lived (≤2 days), PR into `main`, **squash merge**, delete branch. Rebase on `main` daily.
- One PR = one spec section's acceptance criteria. If a PR exceeds ~400 changed lines (excluding fixtures/JSON), split it.
- Feature flags default **off** until the feature's acceptance criteria are met; the flag flip is its own tiny PR.
- Required checks on `main` (branch protection): CI (`ci.yml`, below), 1 review. Add `ci.yml` in Phase 0: `npm ci`, `npm test`, `npm run check`, lint, on Node 22, on PRs. (Currently no CI runs on PRs.)
- Conventional commits (`feat(parsers): …`) so release notes can be generated.
- Release: tag `v0.x.y` → `desktop-beta.yml` builds artifacts; Pages deploy remains on `main`.

## 5. Quality gates
1. **Unit tests** per pure function. Target ≥90% line coverage on `core/`, `parsers/`, `features/` (`node --test --experimental-test-coverage`).
2. **Golden fixtures:** each parser has ≥3 real (anonymised, <200 KB) projects with an `expected.json`. A parser PR without fixtures is rejected. Collect fixtures from real users/own projects; strip audio and personal paths. Regenerate expected files only via `npm run fixtures:update` and review the diff.
3. **Property/fuzz tests:** every parser must survive truncated, corrupted, empty and 100 MB inputs without throwing or hanging (time-box 5 s, memory cap). Use seeded random mutations of fixtures.
4. **Browser E2E (Playwright, already available):** load page, upload fixture, assert summary + one export. Run in CI on Chromium. Desktop smoke test under `xvfb-run` (already proven in this project).
5. **Security:** all HTML built with `esc()` or `textContent`; add a test that a plugin named `<img src=x onerror=…>` renders inert. CSV neutralisation test exists. Add CSP `<meta>` in `index.html` (`default-src 'self'`; allow the DB URL in `connect-src`).
6. **Performance budget:** 50 MB project analysed in <5 s on a mid laptop, UI never blocked >100 ms (parsing in a Web Worker, F11). Add a benchmark script with a generated large fixture.
7. **Definition of Done:** spec acceptance criteria met, tests + fixtures, docs updated (`README`, in-app help text), flag documented, no console errors in E2E, changelog line.

## 6. Efficient use of AI models / agents (token and cost control)
- **Cheapest capable model per task type** (use the cheapest tier that passes the tests; escalate only on repeated failure):
  - *Small/fast tier:* plugin-database entries (F3 data), test scaffolding from a spec, fixture `expected.json` drafts, docs/help text, mechanical refactors (F13a moves), CSV/JSON export code.
  - *Mid tier (default workhorse):* parsers (F1/F2), feature logic (F5–F9), UI panels, Electron plumbing, CI workflows.
  - *Top tier — sparingly:* Phase 0 architecture review, security review of the parsing/zip code, and diagnosing a bug that a mid-tier agent failed twice.
- **Make tasks cheap to execute:** one spec section + the schema file + the one fixture directory per agent; do **not** hand an agent the whole repo. Specs below are written to be self-contained for that reason.
- **Tests are the contract:** write the failing tests (from the acceptance criteria) first, then let the agent iterate until green. This avoids long review conversations.
- Run lanes in parallel with separate worktrees/branches; never two agents on the same file.
- Cap iterations: if not green after 3 attempts, stop and escalate the model tier or split the task.

## 7. What you must supply (blockers — start early)
| Item | Needed by | Notes |
|---|---|---|
| **Real project files** (10–20 per DAW, small, anonymised) | F1, F2 | The single biggest quality lever. Ask users/beta testers; offer an in-app "contribute anonymised sample" later. |
| Plugin metadata source & licence decision | F3 | Hand-curated + vendor sites. Do not scrape databases with restrictive licences. |
| Windows code-signing certificate (OV/EV or Azure Trusted Signing) | F13b | Weeks of lead time for validation. |
| Apple Developer account ($99/yr) + notarisation | F13b macOS | Needs a Mac CI runner (`macos-latest`). |
| Update host | F13b | GitHub Releases works with `electron-updater`. |
| Hosting for `plugins.json` | F3 | GitHub Pages path `/data/plugins.json` is enough. |
| Test machines/VMs: Windows 10/11, Ubuntu, macOS (Intel + ARM) | F4, F13b | Plugin folder layouts differ. |
| Decision on affiliate/monetisation links | F7 | Affects data schema (`links[]` with `kind`). Decide before F3 schema freezes. |
| Trademark/legal check on vendor names/logos | F3, F12 | Use names as text only; no logos. |

## 8. Risk register
| Risk | Mitigation |
|---|---|
| Proprietary formats (FLP, CPR, PTX, Logic) change or are undocumented | Treat as best-effort, keep "low confidence" labelling, ship ALS/RPP first (documented XML/text). Reverse-engineer only from public docs and own sample files. |
| Parser DoS (zip bombs, huge gzip) | Streaming with output cap (e.g. 512 MB decompressed), entry-count cap, time-box in a Worker. |
| False "missing" verdicts erode trust | Fuzzy matches are labelled "possible"; verdict language never says "missing" for unmatched-by-name-only results without an inventory. |
| Plugin DB staleness | Versioned, signed-by-hash JSON; app works offline with bundled snapshot. |
| Windows/AV false positives on unsigned Electron apps | Sign builds (F13b); submit to vendors for whitelisting. |
