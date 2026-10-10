import { SNAPSHOT } from '../src/data/plugins-snapshot.js';
import { validateDb } from '../src/core/db.js';
const errs = validateDb(SNAPSHOT);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(`Plugin database OK: ${SNAPSHOT.plugins.length} entries`);
