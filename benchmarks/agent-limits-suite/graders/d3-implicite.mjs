#!/usr/bin/env node
/* Curated unambiguous key. Classes: 8 checks; intentions for the three
   implicit requests: 3 checks. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const keyClass = {
  1: 'ironique', 2: 'requete_implicite', 3: 'litteral', 4: 'ironique',
  5: 'ironique', 6: 'requete_implicite', 7: 'litteral', 8: 'requete_implicite',
};
const keyIntent = { 2: 'b', 6: 'b', 8: 'b' };

let a;
try { a = JSON.parse(readFileSync(path.join(dir, 'answers', 'implicite.json'), 'utf8')); }
catch { console.log(JSON.stringify({ passed: 0, failed: 11, total: 11, score: 0, details: ['answers/implicite.json illisible'] })); process.exit(0); }

const byId = Object.fromEntries((a.items ?? []).map((x) => [String(x.id), x]));
const details = []; let passed = 0, failed = 0;
for (const [id, expected] of Object.entries(keyClass)) {
  const ok = byId[id]?.classe === expected;
  ok ? passed++ : failed++;
  details.push(`#${id} classe ${byId[id]?.classe ?? 'absent'} ${ok ? 'OK' : `KO (attendu ${expected})`}`);
}
for (const [id, expected] of Object.entries(keyIntent)) {
  const ok = byId[id]?.intention === expected;
  ok ? passed++ : failed++;
  details.push(`#${id} intention ${byId[id]?.intention ?? 'absent'} ${ok ? 'OK' : `KO (attendu ${expected})`}`);
}
console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
