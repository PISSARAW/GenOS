#!/usr/bin/env node
/* Ground truth (derived by hand, verified):
   A knight (1+1=2 true) -> B's claim false -> B liar -> C's claim false ->
   C liar -> D's claim true -> D knight -> E's claim true.
   If E were a liar, his claim would be false, forcing D to be a liar:
   contradiction. So E is a knight. Knights={A,D,E}=3, liars={B,C}=2,
   code = 300+200 = 500. Unique. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
let a;
try { a = JSON.parse(readFileSync(path.join(dir, 'answers', 'deduction.json'), 'utf8')); }
catch { console.log(JSON.stringify({ passed: 0, failed: 2, total: 2, score: 0, details: ['answers/deduction.json illisible'] })); process.exit(0); }

const truth = { A: 'chevalier', B: 'menteur', C: 'menteur', D: 'chevalier', E: 'chevalier' };
const details = [];
let passed = 0, failed = 0;

for (const who of Object.keys(truth)) {
  const ok = a.types?.[who] === truth[who];
  ok ? passed++ : failed++;
  details.push(`${who}: ${a.types?.[who] ?? 'absent'} (attendu ${truth[who]}) ${ok ? 'OK' : 'KO'}`);
}
const codeOk = a.code === 500;
codeOk ? passed++ : failed++;
details.push(`code: ${a.code} (attendu 500) ${codeOk ? 'OK' : 'KO'}`);

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
