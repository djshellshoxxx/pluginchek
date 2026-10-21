# Architecture and Design Rationale

Source: `docs/spec.md` (design constraints, analysis pipeline, accuracy model, safety) and the code layout.

- **Privacy by construction.** Files are read with File and ArrayBuffer APIs only and never uploaded (spec, "Safety, privacy").
- **Static deployment.** No backend or account; the site is GitHub Pages (spec, "Design constraints").
- **Exact parsers first, heuristics as fallback.** Format-aware detectors run before generic signature scanners, and heuristic results are labelled as evidence (spec, "Analysis pipeline" step 5 and "Accuracy model").
- **Evidence and confidence in the UI.** Each result shows its evidence and confidence rather than an unqualified claim (README).
- **Resilience.** Invalid or truncated gzip and ZIP members do not fail the whole scan; errors are reported per file or member (spec, "Safety").
- **No raw HTML from projects.** Project-file text is never inserted into the DOM unsanitised.
- **Pure parser module.** `parser-core.js` keeps parsing separate from the page, so it can be tested with `node --test`.
