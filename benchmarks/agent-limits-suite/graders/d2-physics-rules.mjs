#!/usr/bin/env node
/* Fixed key derived mechanically from rules R1-R6. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const key = {
  s1: 'se_repand',            // R2: ouvert + 60>45
  s2: 'reste_en_place',       // R3 exige >10 deg
  s3: 'contenu_conserve',     // fermee -> R2 inapplicable
  s4: 'se_casse',             // R4: dur + 3>2 m/s
  s5: 'survit',               // R4: surface non dure
  s6: 'continue_indefiniment',// R5
  s7: 'blocage_exclusion',    // R6
  s8: 'ne_bouge_pas',         // soutenu, pas de regle declenchee
  s9: 'roule',                // R3: 25>10
  s10: 'pas_de_repansement',  // R2: 30<45
};

let a;
try { a = JSON.parse(readFileSync(path.join(dir, 'answers', 'physics.json'), 'utf8')); }
catch { console.log(JSON.stringify({ passed: 0, failed: 10, total: 10, score: 0, details: ['answers/physics.json illisible'] })); process.exit(0); }

const details = []; let passed = 0, failed = 0;
for (const [id, expected] of Object.entries(key)) {
  const ok = a[id] === expected;
  ok ? passed++ : failed++;
  details.push(`${id}: ${a[id] ?? 'absent'} ${ok ? 'OK' : `KO (attendu ${expected})`}`);
}
console.log(JSON.stringify({ passed, failed, total: 10, score: Number((passed / 10).toFixed(4)), details }));
