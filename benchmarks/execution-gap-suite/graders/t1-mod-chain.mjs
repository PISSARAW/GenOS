#!/usr/bin/env node
/* Recomputes the modular chain from data.json (square-and-multiply BigInt)
   and grades the submitted checkpoints exactly. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
let d, a;
try {
  d = JSON.parse(readFileSync(path.join(dir, 'data.json'), 'utf8'));
  a = JSON.parse(readFileSync(path.join(dir, 'answers', 'chain.json'), 'utf8'));
} catch (e) { console.log(JSON.stringify({ passed: 0, failed: 2, total: 2, score: 0, details: ['lecture impossible: ' + e.message] })); process.exit(0); }

const m = BigInt(d.modulus);
const modpow = (b, e, mm) => { let r = 1n; b %= mm; while (e > 0n) { if (e & 1n) r = r * b % mm; b = b * b % mm; e >>= 1n; } return r; };
let x = BigInt(d.init);
const marks = [];
d.stages.forEach(([es, ks], i) => {
  x = modpow(x, BigInt(es), m);
  x = x * BigInt(ks) % m;
  if (i === 3) marks.push(x.toString());
});
marks.push(x.toString());

let passed = 0, failed = 0;
const details = [];
for (const [k, i] of [['after_stage_4', 0], ['final', 1]]) {
  const ok = String(a[k]) === marks[i];
  ok ? passed++ : failed++;
  details.push(`${k}: ${a[k]} attendu ${marks[i]} ${ok ? 'OK' : 'KO'}`);
}
console.log(JSON.stringify({ passed, failed, total: 2, score: Number((passed / 2).toFixed(4)), details }));
