# PluginChek

PluginChek is a browser-based DAW project plugin inspector for Circuit Drift Lab. Drop project/session files into the GitHub Pages site and it attempts to recover, normalize and explain plugin references without uploading the project.

## Features
- Ableton Live `.als` gzip/XML decoding
- REAPER text-project inspection
- ZIP/container textual-member inspection for compatible DAW/package formats
- binary printable-string fallback for proprietary project formats
- VST/VST3/AU/AAX/CLAP signature detection
- plugin vendor/category/purpose enrichment for common plugin families
- evidence and confidence display instead of opaque claims
- multi-file analysis and deduplication
- optional local plugin-folder or inventory cross-check
- JSON, CSV and text reports
- static GitHub Pages deployment; no backend or account

See `docs/spec.md` for the complete design and limitations.

## Development

```bash
npm test
npm run check
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Privacy
Project files are processed in the browser. PluginChek itself does not upload project/session contents or send them to a server.
