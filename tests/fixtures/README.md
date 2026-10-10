# Fixtures

`ableton/basic.als.xml` and `reaper/basic.rpp` are **synthetic** files written from the documented element/line layouts.
They exist to lock parser behaviour; they are NOT a substitute for real, anonymised projects (see docs/roadmap/00-delivery-plan.md §5.2).
When real fixtures are added, put each in `tests/fixtures/<daw>/` with an `expected.json` and run `npm test`.
