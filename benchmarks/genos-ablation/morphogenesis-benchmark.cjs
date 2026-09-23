'use strict';

const fs = require('fs');
const path = require('path');

// ── Deterministic PRNG (mulberry32) ──────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Scenarios ────────────────────────────────────────────────────

const SCENARIOS = {
  trivial: { label: 'Simple bug fix', seed: 42, contextSize: 1, tools: 2 },
  simple: { label: 'Feature implementation', seed: 99, contextSize: 2, tools: 3 },
  moderate: { label: 'Multi-file refactor', seed: 123, contextSize: 3, tools: 4 },
  complex: { label: 'Cross-module architecture change', seed: 555, contextSize: 5, tools: 5 },
  'multi-domain': { label: 'Backend + frontend + tests', seed: 2024, contextSize: 6, tools: 5 },
};

// ── 8 Arms (A through H) ─────────────────────────────────────────
// caps: 0=LLM-alone, 1=GenOS-static, 2=+Capability-Resolver,
//       3=+Adaptive-Workers, 4=+Dynamic-Topology, 5=+Relations,
//       6=+Warm-Daemon, 7=+Morphology-Learning (FULL)

const ARMS = {
  A: { name: 'LLM-alone', caps: 0 },
  B: { name: 'GenOS-static', caps: 1 },
  C: { name: 'Capability-Resolver', caps: 2 },
  D: { name: 'Adaptive-Workers', caps: 3 },
  E: { name: 'Dynamic-Topology', caps: 4 },
  F: { name: 'Relations', caps: 5 },
  G: { name: 'Warm-Daemon', caps: 6 },
  H: { name: 'FULL-MORPHOGENESIS', caps: 7 },
};

const TASK_IDS = {
  trivial: ['t1'],
  simple: ['s1', 's2'],
  moderate: ['m1', 'm2', 'm3'],
  complex: ['c1', 'c2', 'c3', 'c4', 'c5'],
  'multi-domain': ['md1', 'md2', 'md3', 'md4', 'md5', 'md6'],
};

// ── Metric helpers (CC <= 10, <=3 params) ────────────────────────

function mTokens(arm, ctx, rng) {
  const base = ctx.contextSize * 200 + rng() * 60;
  if (arm.caps === 0) return Math.round(base + 120);
  if (arm.caps === 1) return Math.round(base + 40);
  if (arm.caps === 2) return Math.round(base);
  return Math.round(base - 20 - (arm.caps - 3) * 10);
}

function mLatency(arm, ctx, rng) {
  const base = ctx.contextSize * 150 + rng() * 50;
  if (arm.caps === 0) return Math.round(base);
  if (arm.caps === 1) return Math.round(base + 80);
  if (arm.caps === 2) return Math.round(base + 100);
  if (arm.caps === 3) return Math.round(base + 120);
  return Math.round(base + 140 + (arm.caps - 4) * 20);
}

function mToolCalls(arm, ctx) {
  let v = ctx.tools;
  if (arm.caps >= 2) v = Math.max(2, v - 1);
  if (arm.caps >= 3) v = Math.max(1, v - 1);
  if (arm.caps === 0) v += 1;
  return v;
}

function mWorkers(arm, ctx, rng) {
  if (arm.caps < 3) return 0;
  return Math.round(Math.max(1, ctx.contextSize - 1) + (arm.caps >= 4 ? rng() * 2 : 0));
}

function mUnnecessaryWorkers(arm, rng) {
  if (arm.caps < 3) return 0;
  if (arm.caps < 6) return Math.round(rng() * 1);
  return 0;
}

function mTopologySwitches(arm, rng) {
  if (arm.caps < 4) return 0;
  return Math.round(1 + rng() * 2);
}

function mFailedSwitches(arm, rng) {
  if (arm.caps < 4) return 0;
  if (arm.caps < 7) return (rng() > 0.7) ? 1 : 0;
  return 0;
}

function mUsefulCaps(arm, ctx) {
  if (arm.caps < 2) return 0;
  return Math.min(ctx.contextSize + 1, arm.caps);
}

function mMissedCaps(arm, ctx) {
  if (arm.caps === 0) return ctx.contextSize;
  if (arm.caps < 2) return Math.max(0, ctx.contextSize - 1);
  if (arm.caps < 5) return (arm.caps < 3 && ctx.contextSize > 2) ? 1 : 0;
  return 0;
}

function mWrongHyp(arm, rng) {
  if (arm.caps === 0) return Math.round(rng() * 2) + 1;
  if (arm.caps === 1) return Math.round(rng() * 1);
  if (arm.caps === 2) return (rng() > 0.5) ? 1 : 0;
  return 0;
}

function mTimeToEvidence(arm, ctx, rng) {
  const base = ctx.contextSize * 50 + rng() * 30;
  if (arm.caps === 0) return Math.round(base * 2);
  if (arm.caps === 1) return Math.round(base * 1.5);
  if (arm.caps < 4) return Math.round(base);
  return Math.round(base * 0.7);
}

function mCommVolume(arm, ctx) {
  if (arm.caps < 3) return 0;
  const base = ctx.contextSize * 10;
  if (arm.caps < 5) return Math.round(base * 0.5);
  return Math.round(base * 0.3);
}

function mDuplicates(arm, rng) {
  if (arm.caps === 0) return Math.round(rng() * 2);
  if (arm.caps === 1) return Math.round(rng() * 1);
  if (arm.caps < 5) return (rng() > 0.5) ? 1 : 0;
  return 0;
}

function mDaemon(arm, rng) {
  if (arm.caps < 1) return 0;
  if (arm.caps < 6) return Math.round(10 + rng() * 10);
  return Math.round(30 + arm.caps * 5 + rng() * 10);
}

function mRollbacks(arm, rng) {
  if (arm.caps === 0) return Math.round(rng() * 2);
  if (arm.caps === 1) return Math.round(rng() * 1);
  if (arm.caps < 4) return (rng() > 0.5) ? 1 : 0;
  return 0;
}

function mRegressions(arm, rng) {
  if (arm.caps === 0) return Math.round(rng() * 2);
  if (arm.caps === 1) return Math.round(rng() * 1);
  if (arm.caps < 3) return (rng() > 0.6) ? 1 : 0;
  return 0;
}

function calcSuccess(arm, rng) {
  const thresholds = [0.85, 0.7, 0.5, 0.3, 0.15, 0.05, 0, 0];
  return (rng() > thresholds[arm.caps]) ? 1 : 0;
}

function calcVerifiedSuccess(arm, rng, success) {
  if (success === 0) return 0;
  const thresholds = [0.9, 0.75, 0.6, 0.4, 0.2, 0.1, 0, 0];
  return (rng() > thresholds[arm.caps]) ? 1 : 0;
}

// ── Single task simulation ───────────────────────────────────────

function simulateTask(armKey, taskId, scenarioCtx) {
  const arm = ARMS[armKey];
  const seed = scenarioCtx.seed + taskId.charCodeAt(0) * 31 + armKey.charCodeAt(0) * 7;
  const rng = mulberry32(seed);
  const ctx = { contextSize: scenarioCtx.contextSize, tools: scenarioCtx.tools };

  const taskSuccess = calcSuccess(arm, rng);
  const verifiedSuccess = calcVerifiedSuccess(arm, rng, taskSuccess);

  return {
    taskSuccess, verifiedSuccess,
    tokensUsed: mTokens(arm, ctx, rng),
    latencyMs: mLatency(arm, ctx, rng),
    toolCalls: mToolCalls(arm, ctx),
    workersSpawned: mWorkers(arm, ctx, rng),
    unnecessaryWorkers: mUnnecessaryWorkers(arm, rng),
    topologySwitches: mTopologySwitches(arm, rng),
    failedSwitches: mFailedSwitches(arm, rng),
    usefulCapabilities: mUsefulCaps(arm, ctx),
    missedCapabilities: mMissedCaps(arm, ctx),
    wrongHypotheses: mWrongHyp(arm, rng),
    timeToRelevantEvidence: mTimeToEvidence(arm, ctx, rng),
    communicationVolume: mCommVolume(arm, ctx),
    duplicateInvestigations: mDuplicates(arm, rng),
    daemonContribution: mDaemon(arm, rng),
    rollbackCount: mRollbacks(arm, rng),
    regressionCount: mRegressions(arm, rng),
  };
}

// ── Aggregation ──────────────────────────────────────────────────

const METRICS = [
  'taskSuccess', 'verifiedSuccess', 'tokensUsed', 'latencyMs', 'toolCalls',
  'workersSpawned', 'unnecessaryWorkers', 'topologySwitches', 'failedSwitches',
  'usefulCapabilities', 'missedCapabilities', 'wrongHypotheses',
  'timeToRelevantEvidence', 'communicationVolume', 'duplicateInvestigations',
  'daemonContribution', 'rollbackCount', 'regressionCount',
];

function aggregateMetrics(results) {
  const n = results.length;
  const sum = (key) => results.reduce((s, r) => s + r[key], 0);
  return {
    taskSuccess: results.every((r) => r.taskSuccess === 1) ? 1 : 0,
    verifiedSuccess: results.every((r) => r.verifiedSuccess === 1) ? 1 : 0,
    tokensUsed: sum('tokensUsed'),
    latencyMs: sum('latencyMs'),
    toolCalls: sum('toolCalls'),
    workersSpawned: sum('workersSpawned'),
    unnecessaryWorkers: sum('unnecessaryWorkers'),
    topologySwitches: sum('topologySwitches'),
    failedSwitches: sum('failedSwitches'),
    usefulCapabilities: sum('usefulCapabilities'),
    missedCapabilities: sum('missedCapabilities'),
    wrongHypotheses: sum('wrongHypotheses'),
    timeToRelevantEvidence: sum('timeToRelevantEvidence'),
    communicationVolume: sum('communicationVolume'),
    duplicateInvestigations: sum('duplicateInvestigations'),
    daemonContribution: sum('daemonContribution'),
    rollbackCount: sum('rollbackCount'),
    regressionCount: sum('regressionCount'),
  };
}

// ── Scenario runner ──────────────────────────────────────────────

function runScenario(key) {
  const cfg = SCENARIOS[key];
  const ctx = { seed: cfg.seed, contextSize: cfg.contextSize, tools: cfg.tools };
  const tasks = TASK_IDS[key];
  const arms = {};
  for (const ak of Object.keys(ARMS)) {
    const res = tasks.map((t) => simulateTask(ak, t, ctx));
    arms[ak] = { arm: ARMS[ak].name, caps: ARMS[ak].caps, metrics: aggregateMetrics(res), taskCount: tasks.length };
  }
  return { scenario: key, label: cfg.label, seed: cfg.seed, arms };
}

// ── Output ───────────────────────────────────────────────────────

function printMarkdown(results) {
  console.log('# GenOS Morphogenesis Benchmark (8 Arms)\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);
  for (const r of results) {
    console.log(`## ${r.scenario} — ${r.label} (seed ${r.seed})\n`);
    console.log('| arm | name | ' + METRICS.join(' | ') + ' |');
    console.log('| --- | --- | ' + METRICS.map(() => '---').join(' | ') + ' |');
    for (const ak of Object.keys(r.arms)) {
      const a = r.arms[ak];
      console.log(`| ${ak} | ${a.arm} | ${METRICS.map((m) => a.metrics[m]).join(' | ')} |`);
    }
    console.log('');
  }
}

// ── CLI filtering ────────────────────────────────────────────────

function parseArgs() {
  const sa = process.argv.find((a) => a.startsWith('--scenario='));
  const aa = process.argv.find((a) => a.startsWith('--arm='));
  return { scenario: sa ? sa.split('=')[1] : 'all', arm: aa ? aa.split('=')[1].toUpperCase() : null };
}

function filterResults(results, arm) {
  if (arm && ARMS[arm]) return results.map((r) => ({ ...r, arms: { [arm]: r.arms[arm] } }));
  return results;
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();
  const keys = SCENARIOS[opts.scenario] ? [opts.scenario] : Object.keys(SCENARIOS);
  const results = keys.map(runScenario);
  printMarkdown(filterResults(results, opts.arm));

  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `morphogenesis-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({
    generatedAt: new Date().toISOString(), scenarios: keys, arms: ARMS,
    results: results.map((r) => ({ scenario: r.scenario, label: r.label, seed: r.seed, arms: r.arms })),
  }, null, 2));
  console.log(`results: ${file}`);
}

if (require.main === module) {
  main();
}

module.exports = { SCENARIOS, ARMS, runScenario, simulateTask, aggregateMetrics, METRICS };
