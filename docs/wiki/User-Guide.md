# User Guide

1. Open the site (GitHub Pages, or serve the folder locally).
2. Drop one or more project files. Supported inputs: Ableton Live `.als`, REAPER text projects, ZIP containers with
   textual members, and a printable-string fallback for proprietary formats.
3. Read the report: project summary, plugin table with vendor, category and purpose, and confidence flags.
   Low-confidence candidates appear distinct from confirmed references.
4. Optionally cross-check against a local plugin folder or inventory.
5. Export as JSON, CSV or text.

**Accuracy:** results are not a complete semantic parse of every DAW version. The UI states the analysis mode
and confidence for each result (`docs/spec.md`, "Accuracy model").

**Large files:** printable-string extraction is capped; the report notes truncation.
