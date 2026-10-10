# PluginChek

PluginChek is a DAW project plugin inspector from Circuit Drift Lab. Drop a project/session file and it recovers, normalises and explains the plugins the project depends on, **entirely on your machine**: nothing is uploaded.

Use it in the browser (GitHub Pages) or as a desktop app (Windows, Linux, macOS beta builds).

## Features
- **Structured parsers** for Ableton Live (`.als`) and REAPER (`.rpp`) with plugin IDs; string-scan fallback for other DAWs (FL Studio, Cubase, Pro Tools, Logic, Studio One, Bitwig, Reason, ZIP-based containers)
- Evidence and confidence on every finding (`high` = structured data with an ID, `low` = text scan)
- Built-in plugin database (vendor, category, price, similar alternatives, platform info)
- **Verdict banner** ("12 plugins; 10 installed; 2 missing") and a *problems only* filter
- **Installed-plugin cross-check**: pick a plugin folder, load a list, or (desktop) *Scan this computer*
- **Missing audio/sample detection** against a project folder you choose
- **Compatibility check** for another OS / CPU (format swaps, Apple Silicon notes) and **alternative plugin suggestions**
- **Compare** two projects or versions, **usage statistics** across many projects (desktop: scan a whole folder)
- Share a clean "what you need" page (HTML / Markdown / print), project card image, recovery wizard, wishlist
- JSON (schema v2), CSV, text and recovery-checklist exports; light/dark themes

See `docs/spec.md` for the original design and `docs/roadmap/` for the delivery plan, feature specs and `02-implementation-status.md` (what is done, what is deliberately deferred).

## Development
```bash
npm test               # unit + fixture tests (Node 22, no dependencies)
npm run check          # syntax check of every source file + plugin database validation
node scripts/e2e.mjs   # browser end-to-end test (needs Playwright + Chromium)
python -m http.server 8000   # then open http://localhost:8000
```

Desktop app:
```bash
npm install
npm start              # run the Electron app
npm run dist:linux     # AppImage + tar.gz
npm run dist:win       # portable + installer (run on Windows, or via the "Desktop beta build" workflow)
npm run dist:mac       # dmg + zip (run on macOS or via the workflow)
```
Beta builds are **unsigned**; Windows SmartScreen / macOS Gatekeeper will warn on first launch.

## Privacy
Project files are processed locally. PluginChek never sends project contents anywhere. The desktop app only reads files and folders you choose (or open with it) and the standard plugin folders when you press *Scan this computer*.
