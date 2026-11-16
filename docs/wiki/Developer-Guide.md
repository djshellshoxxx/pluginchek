# Developer Guide

```bash
npm test                  # node --test tests/*.test.mjs: 12 pass on this snapshot
npm run check             # node --check on parser-core.js and app.js (passes)
python -m http.server 8000
```

Static HTML, CSS and JavaScript; no build step and no backend. CI: `.github/workflows/static.yml`.

Parser logic lives in `parser-core.js` (testable, with no DOM) and UI wiring in `app.js`. Keep new parsers in
`parser-core.js` with tests in `tests/`.
