#!/usr/bin/env node
/* Key authored with the passage; each occurrence carries explicit local cues. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const key = {
  1: 'finance', 2: 'rive', 3: 'finance', 4: 'stock', 5: 'rive',
  6: 'stock', 7: 'finance', 8: 'avion', 9: 'vol', 10: 'avion',
};

let a;
try { a = JSON.parse(readFileSync(path.join(dir, 'answers', 'polysemy.json'), 'utf8')); }
catch { console.log(JSON.stringify({ passed: 0, failed: 10, total: 10, score: 0, details: ['answers/polysemy.json illisible'] })); process.exit(0); }

const details = []; let passed = 0, failed = 0;
for (const [id, expected] of Object.entries(key)) {
  const ok = a[id] === expected;
  ok ? passed++ : failed++;
  details.push(`occ ${id}: ${a[id] ?? 'absent'} ${ok ? 'OK' : `KO (attendu ${expected})`}`);
}
console.log(JSON.stringify({ passed, failed, total: 10, score: Number((passed / 10).toFixed(4)), details }));
