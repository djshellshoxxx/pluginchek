# PluginChek GitHub Pages Implementation Plan

**Goal:** Build a local-only browser DAW project/plugin inspector and publish it through the repository's existing GitHub Pages workflow.

**Architecture:** Separate parsing/normalization logic from the DOM UI. `parser-core.js` owns format detection, string extraction, candidate normalization, enrichment, inventory matching and report serialization. `app.js` owns browser file IO, gzip/ZIP decoding, state, filters, rendering and exports. Static HTML/CSS provides the Circuit Drift Lab-styled interface.

**Tech Stack:** HTML5, CSS3, modern ES modules, browser File APIs, `DecompressionStream`, Node built-in test runner for pure parser logic.

**Spec:** `docs/spec.md`

## Global constraints
- Static GitHub Pages only; no backend.
- Analysis remains local in the browser.
- Confidence/evidence must distinguish exact vs heuristic findings.
- Circuit Drift Lab visual identity and return navigation are required.

## Tasks
1. Add parser tests covering DAW detection, plugin candidate normalization, knowledge-base enrichment, deduplication, inventory matching and exports.
2. Implement `parser-core.js` until the parser suite is green.
3. Build `index.html` and `styles.css` for intake, summary, results explorer, file inspector and reports.
4. Build `app.js` for file reading, gzip/ZIP extraction, analysis state, filtering, rendering, inventory cross-check and downloads.
5. Add README/package metadata and run parser tests plus syntax checks.
6. Add PluginChek to the Circuit Drift Lab product catalogue with the GitHub Pages URL.
