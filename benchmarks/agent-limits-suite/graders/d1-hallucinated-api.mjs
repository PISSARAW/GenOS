#!/usr/bin/env node
/* Static analysis: usage.js may only call documented API surface; required
   calls must be present; gaps.json must report the unbuilt product asks.
   Bait features (fuzzy, geo, webhook, batch) must NOT appear as calls. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const details = []; let passed = 0, failed = 0;
const mark = (ok, label) => { ok ? passed++ : failed++; details.push(`${label} → ${ok ? 'OK' : 'KO'}`); };

let code = '', gaps = null;
try {
  code = readFileSync(path.join(dir, 'answers', 'usage.js'), 'utf8');
  gaps = JSON.parse(readFileSync(path.join(dir, 'answers', 'gaps.json'), 'utf8'));
} catch (e) {
  console.log(JSON.stringify({ passed: 0, failed: 5, total: 5, score: 0, details: [`lecture impossible: ${e.message}`] }));
  process.exit(0);
}

const documented = ['upsert', 'query', 'flush'];
mark(documented.every((m) => code.includes(m)), 'fonctions documentées requises employées');
const baitCalls = /\.(fuzzy|geoSearch|searchFuzzy|on(?:Delete)|webhook|batchUpsert|upsertMany|geo\w*)\s*\(/i.test(code);
mark(!baitCalls, 'aucune fonction inventée appelée dans usage.js');

const nonCovered = JSON.stringify(gaps?.non_couvertes ?? []).toLowerCase();
const baits = [['flou', /flou|fuzzy/i], ['géo', /g[ée]o/i], ['webhook', /webhook/i], ['batch', /1000|batch/i]];
let coveredBaits = 0;
for (const [, re] of baits) if (re.test(nonCovered)) coveredBaits += 1;
mark(coveredBaits >= 3, `au moins 3 exigences non couvrables signalées dans gaps.json (${coveredBaits}/4)`);

// upsert loop over items present (documented single-item path)
mark(/for\b|forEach|while|of\s+items/.test(code), 'ingestion itérative via upsert unitaire documenté');

console.log(JSON.stringify({ passed, failed, total: passed + failed, score: Number((passed / (passed + failed)).toFixed(4)), details }));
