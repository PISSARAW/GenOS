'use strict';

const fs = require('fs');
const path = require('path');
const { summarizePaired } = require('../../backend/src/services/uplift/pairedStats');
const { buildLadder, upliftCard } = require('../../backend/src/services/uplift/ladderService');
const { summarizeCost } = require('../../backend/src/services/uplift/costAccounting');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pairsFor(runs, base) {
  const solos = new Map();
  const genos = new Map();
  for (const r of runs) {
    if (r.suite !== base.suite || r.model !== base.model) continue;
    if (r.mode === 'solo') solos.set(r.case_id, r);
    if (r.mode === 'genos') genos.set(r.case_id, r);
  }
  const pairs = [];
  for (const [id, s] of solos) {
    if (genos.has(id)) pairs.push({ solo: s.score, genos: genos.get(id).score, case_id: id });
  }
  return pairs;
}

function runReport(input) {
  const runs = input.runs || [];
  const ladder = buildLadder(runs.map((r) => ({ model: r.model, score: r.score, mode: r.mode })));
  const pairs = pairsFor(runs, input);
  const stats = summarizePaired(pairs, input.stats || {});
  const card = upliftCard({ baseModel: input.model, genosScore: stats.delta !== null ? meanSolo(runs, input) + stats.delta : null }, ladder);
  const cost = summarizeCost(input.cost || {});
  return { suite: input.suite, model: input.model, ladder, stats, card, cost, kind: 'metric', qualityGuarantee: false };
}

function meanSolo(runs, input) {
  const vals = runs.filter((r) => r.model === input.model && r.mode === 'solo').map((r) => r.score);
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => {
    const i = args.indexOf(k);
    return i >= 0 && args[i + 1] ? args[i + 1] : d;
  };
  const inputFile = get('--input', null);
  const outFile = get('--out', null);
  if (!inputFile) {
    console.error('Usage: node benchmarks/gmub/run-gmub.cjs --input runs.json --out report.json');
    process.exit(1);
  }
  const input = loadJson(path.resolve(inputFile));
  const report = runReport(input);
  const json = JSON.stringify(report, null, 2);
  if (outFile) fs.writeFileSync(path.resolve(outFile), json);
  else console.log(json);
}

if (require.main === module) main();

module.exports = { runReport };
