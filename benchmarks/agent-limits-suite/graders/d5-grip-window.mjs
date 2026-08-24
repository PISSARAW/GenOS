#!/usr/bin/env node
/* Analytic window: F must satisfy m*(9.81+2)/(2*mu) <= F <= 400*m.
   Exactly one object has an empty window and expects "impossible". */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const objects = [
  ['o1', 2, 0.5], ['o2', 0.1, 0.25], ['o3', 5, 0.8],
  ['o4', 3, 0.02], ['o5', 10, 0.005], ['o6', 1, 0.1],
];

let a;
try { a = JSON.parse(readFileSync(path.join(dir, 'answers', 'grip.json'), 'utf8')); }
catch { console.log(JSON.stringify({ passed: 0, failed: objects.length + 1, total: objects.length + 1, score: 0, details: ['answers/grip.json illisible'] })); process.exit(0); }

const details = []; let passed = 0, failed = 0;
const impossibleTruth = [];
for (const [id, m, mu] of objects) {
  const need = (m * (9.81 + 2)) / (2 * mu);
  const crush = 400 * m;
  const possible = need <= crush;
  if (!possible) impossibleTruth.push(id);
  const ans = a[id];
  let ok;
  if (!possible) ok = ans === 'impossible';
  else ok = typeof ans === 'number' && ans >= Math.ceil(need - 1e-9) && ans <= crush;
  ok ? passed++ : failed++;
  details.push(`${id}: fenêtre [${Math.ceil(need)}, ${crush}] → ${ans} ${ok ? 'OK' : 'KO'}`);
}

const wrongImpossible = objects
  .filter(([id]) => a[id] === 'impossible')
  .filter(([id, m, mu]) => (m * 11.81) / (2 * mu) <= 400 * m);
const noFalseImpossible = wrongImpossible.length === 0;
noFalseImpossible ? passed++ : failed++;
details.push(`« impossible » utilisé à tort sur: ${wrongImpossible.map((x) => x[0]).join(',') || 'rien'} → ${noFalseImpossible ? 'OK' : 'KO'}`);

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
