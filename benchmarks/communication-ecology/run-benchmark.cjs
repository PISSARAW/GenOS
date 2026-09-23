'use strict';

/**
 * Runner benchmark écologie de communication (Phase 14).
 *
 * Usage : node benchmarks/communication-ecology/run-benchmark.cjs [--scenario S|M|L|all]
 * Sortie : table console + results/run-<timestamp>.json (non commité).
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const { open } = require('../../backend/node_modules/sqlite');
const { buildWorld, makeIntents } = require('./world.cjs');
const { snapshotWorld } = require('./snapshot.cjs');
const { runNaive, runZeroText } = require('./variants.cjs');
const { runEngine } = require('./engineVariant.cjs');
const { runAblations } = require('./ablations.cjs');
const metrics = require('../../backend/src/services/communication/communicationMetricsService');

const SCENARIOS = {
  S: { size: 10, domains: ['sec'], intents: 12, seed: 7, mission: 'debug', label: '10 agents / debugging' },
  M: { size: 100, domains: ['sec', 'data', 'ops', 'bio'], intents: 60, seed: 21, mission: 'investigation', label: '100 agents / investigation' },
  L: { size: 1000, domains: ['sec', 'data', 'ops', 'bio', 'net', 'web', 'ml', 'hw'], intents: 150, seed: 99, mission: 'search', label: '1000 agents / distributed search' }
};

async function freshDb() {
  return open({ filename: ':memory:', driver: sqlite3.Database });
}

function ratioOf(part, whole) {
  if (whole <= 0) return 0;
  return part / whole;
}

function summarize(name, tally, baseline) {
  return {
    variant: name,
    intents: tally.intents,
    silence: tally.silence,
    recipients: tally.recipients,
    variants: tally.variants,
    llmCalls: tally.llmCalls,
    wakeups: tally.wakeups,
    humans: tally.humans,
    transportMessages: tally.transportMessages,
    fanoutCognitive: tally.fanoutCognitive,
    redundantSent: tally.redundantSent,
    success: tally.success,
    verifiedSuccess: tally.verifiedSuccess,
    contamination: tally.contamination,
    independenceViolations: tally.independenceViolations,
    costUnits: Math.round(tally.costUnits * 1000) / 1000,
    bytesOut: tally.bytesOut,
    wallMs: tally.wallMs,
    deltaRatio: Math.round(ratioOf(tally.refsTransmitted, tally.refsNaive) * 1000) / 1000,
    reductionVsNaive: baseline > 0 ? Math.round((1 - tally.costUnits / baseline) * 1000) / 1000 : 0,
    wakeupRatioVsNaive: ratioOf(tally.wakeups, baseline)
  };
}

async function runScenario(key) {
  const config = SCENARIOS[key];
  const db = await freshDb();
  const world = await buildWorld(db, config);
  const intents = makeIntents(world, config);
  const snap = await snapshotWorld(db, world);
  metrics.resetMetrics();
  const a = runNaive(snap, intents);
  const b = runZeroText(snap, intents);
  const c = await runEngine({ snap, db, intents, opts: { dialectAvailable: false, full: false } });
  const dCollected = [];
  const d = await runEngine({ snap, db, intents, opts: { dialectAvailable: true, full: true, collect: dCollected } });
  const baseline = a.costUnits;
  const result = {
    scenario: key, label: config.label, seed: config.seed,
    world: { agents: world.size, relations: world.relationCount, ground: world.groundCount },
    arms: [
      summarize('A-naive-text', a, baseline),
      summarize('B-zerotext', b, baseline),
      summarize('C-policy', c.tally, baseline),
      summarize('D-full', d.tally, baseline)
    ]
  };
  if (key === 'M') {
    const runs = await runAblations({
      freshDb, worldConfig: config, intents,
      base: { tally: d.tally, records: dCollected, snap },
      baseOpts: { dialectAvailable: true, full: true }
    });
    result.ablations = runs.map((run) => summarize(run.name, run.tally, d.tally.costUnits));
  }
  await db.close();
  return result;
}

function printTable(result) {
  console.log(`\n## ${result.scenario} — ${result.label} (seed ${result.seed})`);
  console.log('| arm | silence | recip | variants | llm | wake | msgs | fanout | redun | success | verif | contam | cost | reduc | delta |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const arm of result.arms) {
    console.log(`| ${arm.variant} | ${arm.silence} | ${arm.recipients} | ${arm.variants} | ${arm.llmCalls} | ${arm.wakeups} | ${arm.transportMessages} | ${arm.fanoutCognitive} | ${arm.redundantSent} | ${arm.success} | ${arm.verifiedSuccess} | ${arm.contamination} | ${arm.costUnits} | ${arm.reductionVsNaive} | ${arm.deltaRatio} |`);
  }
  if (result.ablations) {
    console.log('\nablations vs D-full (cost, wakeups, success) :');
    for (const ablation of result.ablations) {
      console.log(`- ${ablation.variant}: cost ${ablation.costUnits} (reduc ${ablation.reductionVsNaive}), wakeups ${ablation.wakeups}, success ${ablation.success}/${ablation.verifiedSuccess}, contam ${ablation.contamination}`);
    }
  }
}

function selectedScenarios() {
  const arg = process.argv.find((entry) => entry.startsWith('--scenario='));
  const asked = arg ? arg.split('=')[1] : 'all';
  if (SCENARIOS[asked]) return [asked];
  return Object.keys(SCENARIOS);
}

async function main() {
  const keys = selectedScenarios();
  const results = [];
  for (const key of keys) {
    results.push(await runScenario(key));
    printTable(results[results.length - 1]);
  }
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `run-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nresults: ${file}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('BENCHMARK FAIL:', error);
    process.exit(1);
  });
}

module.exports = { SCENARIOS, runScenario };
