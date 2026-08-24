#!/usr/bin/env node
/* Grades the underdetermination trio: exact solution SET for U (order-free,
   no extras, no missing), unique V, and the coherence verdict for W. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
let a;
try { a = JSON.parse(readFileSync(path.join(dir, 'answers', 'trio.json'), 'utf8')); }
catch { console.log(JSON.stringify({ passed: 0, failed: 3, total: 3, score: 0, details: ['answers/trio.json illisible'] })); process.exit(0); }

const details = []; let passed = 0, failed = 0;
const mark = (ok, label) => { ok ? passed++ : failed++; details.push(`${label} → ${ok ? 'OK' : 'KO'}`); };

// U ground truth enumerated independently.
const truthU = [];
for (let x = 1; x <= 9; x++) for (let y = 1; y <= 9; y++) for (let z = 1; z <= 9; z++)
  if (x + y === 12 && x * z === 18 && new Set([x, y, z]).size === 3) truthU.push([x, y, z]);

const got = (a.U ?? []).map((o) => [o.x, o.y, o.z]);
const keyOf = (t) => t.join(',');
const setOk = got.length === truthU.length && truthU.every((t) => got.some((g) => g.join(',') === keyOf(t)));
mark(setOk, `U : les ${truthU.length} solutions exactement (${JSON.stringify(got)})`);

const v = a.V ?? null;
mark(v !== null && v !== undefined && typeof v === 'object'
  ? Number(v.x) === 4 && Number(v.y) === 6 && Number(v.z) === 9
  : false, 'V : solution unique (4,6,9), pas d’abstention');

mark(typeof a.W === 'string' && /incoheren|inconsisten/i.test(a.W), 'W : incohérence détectée');

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
