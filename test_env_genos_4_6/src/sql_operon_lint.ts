// sql_operon_lint.ts - outil de l'opéron SQL : détection d'opérateurs invalides.
import { readFileSync } from 'node:fs';

const statements = readFileSync('queries.sql', 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('--'));
const diagnostics: string[] = [];

statements.forEach((sql, idx) => {
  if (/[^<>=!]==[^=]/.test(sql)) { diagnostics.push(`statement ${idx + 1}: '==' invalide en SQL (utiliser '=')`); }
  if (/;\s*\S/.test(sql)) { diagnostics.push(`statement ${idx + 1}: plusieurs instructions sur une ligne`); }
  if (!/;$/.test(sql)) { diagnostics.push(`statement ${idx + 1}: point-virgule manquant`); }
});

if (diagnostics.length === 0) { console.log('SQL LINT: OK (opérateurs valides, terminators présents)'); }
else { console.log(`SQL LINT: ${diagnostics.length} problème(s)`); diagnostics.forEach((d) => console.log(`  - ${d}`)); process.exitCode = 1; }
