'use strict';

const fs = require('fs');
const path = require('path');
const { summarizePaired } = require('../../backend/src/services/uplift/pairedStats');
const { buildLadder, upliftCard } = require('../../backend/src/services/uplift/ladderService');
const { summarizeCost } = require('../../backend/src/services/uplift/costAccounting');
const { triplesFor, summarizeABC } = require('../../backend/src/services/uplift/computeControl');
const { weakestCrossover } = require('../../backend/src/services/uplift/wmcService');
const { attributionVerdict } = require('../../backend/src/services/uplift/capabilityAttribution');
const { ablationTable } = require('../../backend/src/services/uplift/ablationService');
const { biomimeticVerdict } = require('../../backend/src/services/uplift/biomimicryTest');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pairsFor(runs, base) {
  const solos = new Map();
  const genos = new Map();
  for (const r of runs) {
    if (r.suite !== base.suite || r.model !== base.model) continue;
    const key = `${r.case_id}:${r.replicate || 0}`;
    if (r.mode === 'solo') solos.set(key, r);
    if (r.mode === 'genos') genos.set(key, r);
  }
  const pairs = [];
  for (const [key, s] of solos) {
    if (genos.has(key)) pairs.push({ solo: s.score, genos: genos.get(key).score, case_id: s.case_id, soloId: s.id, genosId: genos.get(key).id });
  }
  return pairs;
}

function runReport(input) {
  const runs = input.runs || [];
  const ladder = buildLadder(runs.map((r) => ({ model: r.model, score: r.score, mode: r.mode })));
  const pairs = pairsFor(runs, input);
  const stats = summarizePaired(pairs, input.stats || {});
  const card = upliftCard({ baseModel: input.model, genosScore: stats.delta !== null ? meanSolo(runs, input) + stats.delta : null }, ladder);
  const cost = summarizeCost(costInput(input));
  const abc = summarizeABC(triplesFor(runs, input), input.stats || {});
  const modelComparisons = compareLadder(runs, input, ladder);
  setEvidenceBasedCard({ card, comparisons: modelComparisons, ladder, baseModel: input.model });
  const wmc = weakestWmc(input, ladder);
  const gcab = gcabSection(input);
  const integrity = campaignIntegrity(input, ladder, pairs);
  return { suite: input.suite, model: input.model, ladder, stats, card, modelComparisons, cost, abc, wmc, gcab, integrity, pairedRuns: pairs, kind: 'metric', qualityGuarantee: false };
}

function campaignIntegrity(input, ladder, pairs) {
  const context = { input, ladder, pairs, runs: input.runs || [], errors: [] };
  checkCoverage(context);
  checkProvenance(context);
  checkBudget(context);
  return { status: context.errors.length ? 'incomplete' : 'ready_for_review',
    errors: context.errors, pairedCount: pairs.length };
}

function checkCoverage(context) {
  const { input, ladder, pairs, runs, errors } = context;
  if (ladder.length < 3) errors.push('La ladder solo doit contenir au moins trois modèles.');
  if (!ladder.some((step) => step.model === input.model)) errors.push('Le modèle de base doit être mesuré en solo.');
  if (!runs.length || runs.some((run) => !isMeasured(run.score))) errors.push('Des scores mesurés manquent.');
  if (pairs.length < 2) errors.push('Au moins deux paires solo/GenOS sont nécessaires pour un intervalle de confiance.');
  const triples = triplesFor(runs, input);
  if (triples.length < 2) errors.push('Au moins deux triplets solo/contrôle/GenOS sont nécessaires.');
  if (triples.length !== baseSoloRuns(runs, input).length) errors.push('Les trois bras ne couvrent pas les mêmes cas et répétitions.');
}

function checkProvenance(context) {
  const { runs, errors } = context;
  if (runs.some(hasMissingTopologyProvenance)) errors.push('Le commit propre, la provenance GenOS ou la topologie manque.');
  if (runs.some(hasMissingCapabilities)) errors.push('Les capacités observées manquent pour un run GenOS.');
  if (runs.some(hasMissingRunTelemetry)) errors.push('Modèle demandé/servi, tokens ou latence mesurés manquants.');
  if (runs.some((run) => !isMeasured(run.cost_usd))) errors.push('Le coût réel manque pour au moins un run.');
}

function checkBudget(context) {
  const budgets = context.input.budgets || {};
  if (!['tokens', 'cost_usd', 'time_s'].every((key) => isMeasured(budgets[key]))) {
    context.errors.push('Les plafonds communs de tokens, coût et temps manquent.');
  } else if (context.runs.some((run) => exceedsBudget(run, budgets))) {
    context.errors.push('Au moins un run dépasse le plafond commun.');
  }
}

function isMeasured(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function hasMissingTopologyProvenance(run) {
  return run.mode === 'genos' && (!run.genos_commit || !run.topology || run.working_tree_clean !== true);
}

function hasMissingCapabilities(run) {
  return run.mode === 'genos' && !Array.isArray(run.observed_capabilities);
}

function hasMissingRunTelemetry(run) {
  return !run.requestedModel || !run.servedModel || !isMeasured(run.tokens) || !isMeasured(run.latency_ms);
}

function exceedsBudget(run, budgets) {
  return Number(run.tokens) > Number(budgets.tokens) || Number(run.cost_usd) > Number(budgets.cost_usd)
    || Number(run.latency_ms) > Number(budgets.time_s) * 1000;
}

function baseSoloRuns(runs, input) {
  return runs.filter((run) => run.model === input.model && run.mode === 'solo' && run.score !== null && run.score !== undefined && Number.isFinite(Number(run.score)));
}

function compareLadder(runs, input, ladder) {
  return ladder.map((entry) => {
    const solo = indexedMode(runs, entry.model, 'solo');
    const genos = indexedMode(runs, input.model, 'genos');
    const pairs = [...genos.keys()].filter((key) => solo.has(key)).map((key) => ({ solo: solo.get(key).score, genos: genos.get(key).score }));
    return { model: entry.model, stats: summarizePaired(pairs, input.stats || {}) };
  });
}

function indexedMode(runs, model, mode) {
  const entries = new Map();
  for (const run of runs) {
    if (run.model !== model || run.mode !== mode || run.score === null || run.score === undefined || !Number.isFinite(Number(run.score))) continue;
    entries.set(`${run.case_id}:${run.replicate || 0}`, run);
  }
  return entries;
}

function setEvidenceBasedCard(context) {
  const { card, comparisons, ladder, baseModel } = context;
  const baseRank = ladder.findIndex((item) => item.model === baseModel);
  const beaten = comparisons.filter((item) => item.stats.beaten === true)
    .map((item) => ladder.find((step) => step.model === item.model)).filter(Boolean)
    .sort((a, b) => b.rank - a.rank);
  const highest = beaten[0] || null;
  card.highestBeaten = highest ? highest.model : null;
  card.tierUplift = highest && baseRank >= 0 ? Math.max(0, highest.rank - baseRank) : null;
  card.beatenVerdict = highest ? 'beaten' : 'inconclusive';
}

function gcabSection(input) {
  const cfg = input.gcab || {};
  if (emptyGcab(cfg)) return null;
  return {
    attribution: gcabAttribution(cfg),
    ablations: ablationTable(cfg.ablations || [], input.stats || {}),
    biomimicry: gcabBiomimicry(cfg, input.stats || {})
  };
}

function emptyGcab(cfg) {
  return !cfg.run && !cfg.ablations && !cfg.biomimicry;
}

function gcabAttribution(cfg) {
  if (!cfg.run) return null;
  return attributionVerdict(cfg.run, cfg.contract || null);
}

function gcabBiomimicry(cfg, stats) {
  const samples = cfg.biomimicry || [];
  if (!samples.length) return null;
  return biomimeticVerdict(samples, stats);
}

function weakestWmc(input, ladder) {
  if (!input.wmc || !input.wmc.frontier) return null;
  const frontier = ladder.find((s) => s.model === input.wmc.frontier);
  if (!frontier) return null;
  const frontierRuns = indexedMode(input.runs || [], input.wmc.frontier, 'solo');
  const cands = ladder.map((step) => {
    const genos = indexedMode(input.runs || [], step.model, 'genos');
    const pairs = [...genos.keys()].filter((key) => frontierRuns.has(key))
      .map((key) => ({ solo: frontierRuns.get(key).score, genos: genos.get(key).score }));
    const comparison = summarizePaired(pairs, { ...(input.stats || {}), delta: input.wmc.margin || 0 });
    return { model: step.model, soloScore: step.score, genosScore: genosMean(input, step.model), lcb: comparison.lcb, comparison };
  });
  return weakestCrossover(cands, { score: 0, margin: input.wmc.margin || 0 });
}

function genosMean(input, model) {
  return meanMode(input.runs || [], model, 'genos');
}

function meanMode(runs, model, mode) {
  const vals = runs.filter((run) => run.model === model && run.mode === mode && run.score !== null && run.score !== undefined).map((run) => Number(run.score));
  return vals.length ? vals.reduce((sum, value) => sum + value, 0) / vals.length : null;
}

function sumMode(runs, criteria) {
  const { model, mode, field } = criteria;
  const vals = runs.filter((run) => run.model === model && run.mode === mode && run[field] !== null && run[field] !== undefined).map((run) => Number(run[field]));
  return vals.length ? vals.reduce((sum, value) => sum + value, 0) : null;
}

function costInput(input) {
  const runs = input.runs || [];
  const derived = { soloQuality: meanMode(runs, input.model, 'solo'), genosQuality: meanMode(runs, input.model, 'genos'),
    soloCost: sumMode(runs, { model: input.model, mode: 'solo', field: 'cost_usd' }), genosCost: sumMode(runs, { model: input.model, mode: 'genos', field: 'cost_usd' }),
    soloTokens: sumMode(runs, { model: input.model, mode: 'solo', field: 'tokens' }), genosTokens: sumMode(runs, { model: input.model, mode: 'genos', field: 'tokens' }) };
  return { ...derived, ...(input.cost || {}) };
}

function meanSolo(runs, input) {
  return meanMode(runs, input.model, 'solo') ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => {
    const i = args.indexOf(k);
    return i >= 0 && args[i + 1] ? args[i + 1] : d;
  };
  const inputFile = get('--input', null);
  const outFile = get('--out', null);
  const persist = get('--persist', null);
  const exportSuite = get('--export-suite', null);
  if (exportSuite) {
    if (!persist) throw new Error('--export-suite requires --persist <database-path>.');
    const runs = await exportCampaign(exportSuite, path.resolve(persist));
    writeOutput(outFile, JSON.stringify({ suite: exportSuite, runs }, null, 2));
    return;
  }
  if (!inputFile) {
    console.error('Usage: node benchmarks/gmub/run-gmub.cjs --input runs.json --out report.json');
    process.exit(1);
  }
  const input = loadJson(path.resolve(inputFile));
  input.runs = (input.runs || []).map((run) => ({ ...run, id: run.id || require('crypto').randomUUID() }));
  const report = runReport(input);
  if (persist) await persistCampaign(input, report, path.resolve(persist));
  delete report.pairedRuns;
  const json = JSON.stringify(report, null, 2);
  writeOutput(outFile, json);
}

function writeOutput(outFile, content) {
  if (outFile) fs.writeFileSync(path.resolve(outFile), content);
  else console.log(content);
}

async function exportCampaign(suite, databasePath) {
  process.env.GENOS_DB_PATH = databasePath;
  const repository = require('../../backend/src/services/uplift/campaignRepository');
  const { closeDatabase } = require('../../backend/src/db');
  try { return await repository.exportSuite(suite); }
  finally { await closeDatabase(); }
}

async function persistCampaign(input, report, databasePath) {
  process.env.GENOS_DB_PATH = databasePath;
  const repository = require('../../backend/src/services/uplift/campaignRepository');
  const { closeDatabase } = require('../../backend/src/db');
  try {
    const runIds = await repository.persistRuns(input.runs || [], { suite: input.suite, genos_commit: input.genos_commit, topology: input.topology });
    await repository.persistComparison(input, report, runIds);
  } finally {
    await closeDatabase();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { runReport, pairsFor };
