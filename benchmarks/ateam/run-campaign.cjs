'use strict';

/**
 * A-Team campaign runner (ADR 0113, phase 2 — pilote).
 *
 * Executes `scenarios-v1.json` on a subset of arms (default: solo vs
 * a_team_full, 2 repetitions) through `createRealAdapter` + `runBenchmark`,
 * then archives raw runs, per-arm summaries and paired deltas to
 * `benchmarks/ateam/results/campagne-<timestamp>.json`.
 *
 * Usage:
 *   node benchmarks/ateam/run-campaign.cjs [--scenarios=path] [--arms=solo,a_team_full]
 *     [--repetitions=2] [--model=qwen2.5:14b] [--out=path] [--only=config-patch,api-release]
 *     [--list-only]
 *
 * `--list-only` prints the planned (scenario x arm x repetition) pairs and
 * exits without executing anything. Every other mode runs real missions.
 */

const fs = require('fs');
const path = require('path');
const { runBenchmark } = require('./benchmarkRunner.cjs');
const { createRealAdapter } = require('./realAdapter.cjs');

function parseArgs(argv) {
  const args = { scenarios: null, arms: 'solo,a_team_full', repetitions: '2', model: null, out: null, only: null, listOnly: false };
  for (const token of argv) {
    if (token === '--list-only') { args.listOnly = true; continue; }
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(token);
    if (!match) throw coded(`Unknown argument: ${token}.`, 'ATEAM_CAMPAIGN_ARG_UNKNOWN');
    if (!(match[1] in args)) throw coded(`Unknown argument: ${token}.`, 'ATEAM_CAMPAIGN_ARG_UNKNOWN');
    args[match[1]] = match[2];
  }
  return {
    scenariosPath: args.scenarios || path.join(__dirname, 'scenarios-v1.json'),
    armIds: String(args.arms).split(',').map((id) => id.trim()).filter(Boolean),
    repetitions: Math.max(1, Math.floor(Number(args.repetitions) || 0)),
    model: args.model || null,
    outPath: args.out || null,
    only: args.only ? String(args.only).split(',').map((id) => id.trim()).filter(Boolean) : null,
    listOnly: args.listOnly
  };
}

function selectScenarios(corpus, only) {
  const scenarios = Array.isArray(corpus.scenarios) ? corpus.scenarios : [];
  if (!only) return scenarios;
  return scenarios.filter((scenario) => only.includes(scenario.scenarioId));
}

function planPairs(job) {
  const pairs = [];
  for (let repetition = 0; repetition < job.repetitions; repetition += 1) {
    for (const scenario of job.scenarios) {
      for (const arm of job.armIds) pairs.push({ scenarioId: scenario.scenarioId, arm, repetition });
    }
  }
  return pairs;
}

async function runCampaign(job) {
  if (!job.scenarios.length) throw coded('Campaign has no scenarios to run.', 'ATEAM_CAMPAIGN_NO_SCENARIOS');
  const benchmark = await job.benchmarkFn({
    scenarios: job.scenarios, repetitions: job.repetitions, arms: job.armIds, executeCase: job.executeCase
  });
  const report = {
    protocol: benchmark.protocol,
    generatedAt: job.clock(),
    corpus: { version: job.corpusVersion, scenarioIds: job.scenarios.map((scenario) => scenario.scenarioId) },
    arms: job.armIds,
    repetitions: job.repetitions,
    model: job.model,
    result: { runs: benchmark.runs, arms: benchmark.arms, deltas: benchmark.deltas }
  };
  const outPath = job.outPath || defaultOutPath(job.rootDir, report.generatedAt);
  job.writeReport({ outPath, report });
  return { outPath, report };
}

function defaultOutPath(rootDir, generatedAt) {
  const stamp = String(generatedAt).replace(/[:.]/g, '-');
  return path.join(rootDir, 'benchmarks/ateam/results', `campagne-${stamp}.json`);
}

function printPlanned(pairs) {
  console.log(`Planned pairs: ${pairs.length}`);
  for (const pair of pairs) console.log(`- ${pair.scenarioId} x ${pair.arm} (repetition ${pair.repetition})`);
}

function printSummary(job) {
  console.log(`Report: ${job.outPath}`);
  for (const armId of Object.keys(job.report.result.arms)) {
    const summary = job.report.result.arms[armId];
    console.log(`- ${armId}: verified=${summary.verifiedSuccessRate} invalidEvidence=${summary.invalidEvidenceRate} n=${summary.sampleCount}`);
  }
}

function loadCorpus(scenariosPath) {
  return JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(__dirname, '../..');
  const corpus = loadCorpus(config.scenariosPath);
  const scenarios = selectScenarios(corpus, config.only);
  if (config.listOnly) { printPlanned(planPairs({ scenarios, armIds: config.armIds, repetitions: config.repetitions })); return; }
  const { executeCase } = createRealAdapter({ rootDir, model: config.model });
  const finished = await runCampaign({
    scenarios, armIds: config.armIds, repetitions: config.repetitions, model: config.model,
    corpusVersion: corpus.version || 'unknown', rootDir, outPath: config.out, executeCase,
    benchmarkFn: runBenchmark, clock: () => new Date().toISOString(),
    writeReport: ({ outPath, report }) => {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    }
  });
  printSummary(finished);
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

if (require.main === module) {
  main().catch((error) => { console.error(`CAMPAIGN FAIL: ${error.message}`); process.exit(1); });
}

module.exports = { parseArgs, selectScenarios, planPairs, runCampaign };
