#!/usr/bin/env node
/* Remnant scan across ALL files in answers/ + migrated fields + rationale. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const details = []; let passed = 0, failed = 0;
const mark = (ok, label) => { ok ? passed++ : failed++; details.push(`${label} → ${ok ? 'OK' : 'KO'}`); };

const answersDir = path.join(dir, 'answers');
let auth = null, notes = '', allText = '';
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const t = readFileSync(p, 'utf8');
    allText += `\n--${f}--\n${t}`;
    if (f === 'auth.json') { try { auth = JSON.parse(t); } catch { auth = null; } }
    if (f.startsWith('migration-notes')) notes = t;
  }
}
try { walk(answersDir); } catch (e) {
  console.log(JSON.stringify({ passed: 0, failed: 5, total: 5, score: 0, details: [`répertoire answers/ illisible: ${e.message}`] }));
  process.exit(0);
}

mark(auth !== null, 'auth.json présent et valide');
const remnant = /\bauthKey\b|cle_statique|staticAuth|sk-live-/i.test(allText);
mark(!remnant, 'aucune trace de l’ancien mécanisme dans answers/');
mark(auth?.mecanisme === 'keyring_rotation', 'mecanisme = keyring_rotation');
mark(typeof auth?.keyringId === 'string' && auth.keyringId.length > 0, 'keyringId renseigné');
const daysOk = typeof auth?.rotationJours === 'number' && auth.rotationJours <= 30 && auth.rotationJours > 0;
const notesOk = /CVE-2044-1177|r[ée]vocation|invalid/i.test(notes) && notes.length > 40;
mark(daysOk && notesOk ? true : false, `rotationJours ≤ 30 (${auth?.rotationJours}) + notes expliquent l’invalidation`);

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
