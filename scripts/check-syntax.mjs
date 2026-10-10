import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const skip = new Set(['node_modules', 'dist', '.git']);
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { if (skip.has(n)) continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(m?js|cjs)$/.test(n) && files.push(p); } })('.');
let bad = 0;
for (const f of files) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad++; console.error(`Syntax error in ${f}\n${e.stderr}`); } }
if (bad) process.exit(1);
console.log(`Syntax OK: ${files.length} files`);
