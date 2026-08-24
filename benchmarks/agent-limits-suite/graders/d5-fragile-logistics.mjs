#!/usr/bin/env node
/* Deterministic simulator of the documented mechanics. Grades: deliveries,
   intact cargo, fuel, legality (no crash, no shock, no bad pickup), plus the
   trivial math twin. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const packages = {
  P1: { at: [0, 4], dest: [3, 4] },
  P2: { at: [2, 1], dest: [4, 1] },
  P3: { at: [5, 0], dest: [5, 3] },
};
const details = []; let passed = 0, failed = 0;
const mark = (ok, label) => { ok ? passed++ : failed++; details.push(`${label} → ${ok ? 'OK' : 'KO'}`); };

let plan = '', math = '';
try { plan = readFileSync(path.join(dir, 'answers', 'plan.txt'), 'utf8'); } catch { /* below */ }
try { math = readFileSync(path.join(dir, 'answers', 'math.txt'), 'utf8'); } catch { /* below */ }

let r = 0, c = 0, facingIdx = 1; // N,E,S,W
let v = 0, carrying = null, fuel = 0;
let broken = false, illegal = null;
const delivered = new Set();
const FUEL_MAX = 40;
for (const raw of plan.split(/\r?\n/)) {
  const cmd = raw.trim().toUpperCase();
  if (!cmd) continue;
  fuel += 1;
  if (fuel > FUEL_MAX) { illegal = `carburant dépassé`; break; }
  if (cmd === 'MOVE') {
    const dr = [-1, 0, 1, 0][facingIdx], dc = [0, 1, 0, -1][facingIdx];
    r += dr; c += dc;
    v = Math.min(v + 1, 3);
    if (r < 0 || r > 5 || c < 0 || c > 5) { broken = true; illegal = `crash hors grille au coup ${fuel}`; break; }
  } else if (cmd === 'STOP') {
    v = 0;
  } else if (cmd === 'TURN_L') {
    facingIdx = (facingIdx + 3) % 4;
    if (v >= 2 && carrying) { broken = true; illegal = `secousse fatale (v=${v}) avec colis au coup ${fuel}`; break; }
    if (v >= 2) v = 0;
  } else if (cmd === 'TURN_R') {
    facingIdx = (facingIdx + 1) % 4;
    if (v >= 2 && carrying) { broken = true; illegal = `secousse fatale (v=${v}) avec colis au coup ${fuel}`; break; }
    if (v >= 2) v = 0;
  } else if (cmd.startsWith('PICKUP')) {
    const id = cmd.split(/\s+/)[1];
    if (v !== 0 || carrying) { illegal = `PICKUP illégal (v=${v})`; break; }
    if (!packages[id] || r !== packages[id].at[0] || c !== packages[id].at[1]) { illegal = `PICKUP ${id} hors position`; break; }
    carrying = id;
  } else if (cmd.startsWith('DROP')) {
    const id = cmd.split(/\s+/)[1] ?? carrying;
    if (v !== 0 || !carrying || id !== carrying) { illegal = `DROP illégal`; break; }
    if (r === packages[id].dest[0] && c === packages[id].dest[1]) delivered.add(id);
    carrying = null;
  } else { illegal = `commande inconnue: ${cmd}`; break; }
}

mark(delivered.size === 3 && !broken && !illegal, `3 colis livrés intacts, plan légal (${illegal ?? `${delivered.size} livrés`})`);
mark(fuel <= FUEL_MAX && fuel > 0, `carburant ${fuel} ≤ ${FUEL_MAX}`);
mark(!broken, 'aucun colis cassé');
mark(Number(math.trim()) === 391, `jumelle mathématique 17×23 = ${math.trim()}`);

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
