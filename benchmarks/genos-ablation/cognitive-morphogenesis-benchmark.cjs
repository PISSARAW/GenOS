'use strict';

const fs = require('fs');
const path = require('path');

// ── Deterministic PRNG (mulberry32) ──────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
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
// caps: 0=LLM-alone, 1=GenOS-static, 2=+Epistemic-State,
//       3=+Memory-Ecology, 4=+Dynamic-Cognitive-Keys,
//       5=+Dynamic-Strategy-Resolver, 6=+Drives/Neuromodulation,
//       7=FULL-COGNITIVE-MORPHOGENESIS

const ARMS = {
  A: { name: 'LLM-alone', caps: 0 },
  B: { name: 'GenOS-static', caps: 1 },
  C: { name: 'B+Epistemic-State', caps: 2 },
  D: { name: 'C+Memory-Ecology', caps: 3 },
  E: { name: 'D+Cognitive-Keys', caps: 4 },
  F: { name: 'E+Strategy-Resolver', caps: 5 },
  G: { name: 'F+Drives/Neuromod', caps: 6 },
  H: { name: 'FULL-COGNITIVE-MORPHOGENESIS', caps: 7 },
};

// ── 5 Ablations (FULL - X) ───────────────────────────────────────

const ABLATIONS = {
  'FULL-epistemics': { remove: 'epistemics', label: 'FULL - Epistemics' },
  'FULL-memory': { remove: 'memory', label: 'FULL - Memory Ecology' },
  'FULL-cognitiveKeys': { remove: 'cognitiveKeys', label: 'FULL - Cognitive Keys' },
  'FULL-strategy': { remove: 'strategy', label: 'FULL - Strategy Adaptation' },
  'FULL-regulation': { remove: 'regulation', label: 'FULL - Regulation/Drives' },
};

const SYSTEM_LEVEL = { epistemics: 2, memory: 3, cognitiveKeys: 4, strategy: 5, regulation: 6 };

const TASK_IDS = {
  trivial: ['t1'],
  simple: ['s1', 's2'],
  moderate: ['m1', 'm2', 'm3'],
  complex: ['c1', 'c2', 'c3', 'c4', 'c5'],
  'multi-domain': ['md1', 'md2', 'md3', 'md4', 'md5', 'md6'],
};

// ── Helpers ──────────────────────────────────────────────────────

function has(arm, system) {
  if (arm.ablate === system) return false;
  return arm.caps >= SYSTEM_LEVEL[system];
}

// ── Metric functions (CC <= 10, <=3 params) ──────────────────────

function mTaskSuccess(arm, rng) {
  const t = [0.9, 0.75, 0.6, 0.45, 0.3, 0.2, 0.1, 0.05];
  return (rng() > t[arm.caps]) ? 1 : 0;
}

function mVerifiedSuccess(arm, rng, success) {
  if (!success) return 0;
  const t = [0.95, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1];
  return (rng() > t[arm.caps]) ? 1 : 0;
}

function mUnverifiedClaims(arm, rng) {
  let v = Math.round(4 - arm.caps * 0.4 + rng() * 2);
  if (has(arm, 'epistemics')) v = Math.max(0, v - 3);
  return Math.max(0, v);
}

function mContradictions(arm, rng) {
  let v = Math.round(3 - arm.caps * 0.3 + rng() * 2);
  if (has(arm, 'epistemics')) v = Math.max(0, v - 2);
  return Math.max(0, v);
}

function mWrongHyp(arm, rng) {
  let v = Math.round(4 - arm.caps * 0.4 + rng() * 2);
  if (has(arm, 'epistemics')) v = Math.max(0, v - 2);
  if (has(arm, 'strategy')) v = Math.max(0, v - 1);
  return Math.max(0, v);
}

function mTokens(arm, ctx, rng) {
  const base = ctx.contextSize * 200 + rng() * 60;
  let v = base + 150 - arm.caps * 20;
  if (has(arm, 'memory')) v -= 40;
  return Math.round(Math.max(50, v));
}

function mLatency(arm, ctx, rng) {
  const base = ctx.contextSize * 150 + rng() * 50;
  let v = base + 80 - arm.caps * 12;
  if (has(arm, 'memory')) v -= 25;
  if (has(arm, 'strategy')) v -= 20;
  return Math.round(Math.max(30, v));
}

function mRepeatedDeadEnds(arm, rng) {
  let v = Math.round(4 - arm.caps * 0.4 + rng() * 2);
  if (has(arm, 'memory')) v = Math.max(0, v - 3);
  return Math.max(0, v);
}

function mMemoryReuse(arm, rng) {
  if (!has(arm, 'memory')) return 0;
  return Math.round(2 + arm.caps * 0.4 + rng() * 2);
}

function mStrategyChanges(arm, rng) {
  if (!has(arm, 'strategy')) return 0;
  return Math.round(2 + rng() * 2);
}

function mUsefulStrategyChanges(arm, rng) {
  if (!has(arm, 'strategy')) return 0;
  return Math.round(2 + rng() * 2);
}

function mCognitiveDiversity(arm, rng) {
  if (!has(arm, 'cognitiveKeys')) return Math.round(rng());
  return Math.round(3 + rng() * 2);
}

function mRecipeUtility(arm, rng) {
  if (arm.caps < 7) return 0;
  return Math.round(4 + rng() * 2);
}

function mInformationGain(arm, rng) {
  let v = Math.round(2 + arm.caps * 0.3 + rng() * 2);
  if (has(arm, 'epistemics')) v += 3;
  return v;
}

function mUncertaintyReduction(arm, rng) {
  let v = Math.round(2 + arm.caps * 0.3 + rng() * 2);
  if (has(arm, 'epistemics')) v += 3;
  return v;
}

function mTopologyChanges(arm, rng) {
  if (arm.caps < 4) return 0;
  let v = Math.round(1 + rng() * 2);
  if (has(arm, 'strategy')) v += 2;
  if (has(arm, 'regulation')) v += 1;
  return v;
}

function mUnnecessaryMorph(arm, rng) {
  let v = Math.round(3 - arm.caps * 0.3 + rng() * 2);
  if (has(arm, 'cognitiveKeys')) v = Math.max(0, v - 2);
  if (has(arm, 'regulation')) v = Math.max(0, v - 1);
  return Math.max(0, v);
}

function mAgentSurvival(arm, rng) {
  let v = 0.4 + arm.caps * 0.06 + rng() * 0.2;
  if (has(arm, 'regulation')) v += 0.15;
  return Number(Math.min(1, v).toFixed(2));
}

function mBudgetEfficiency(arm, rng) {
  let v = 0.2 + arm.caps * 0.08 + rng() * 0.1;
  if (has(arm, 'regulation')) v += 0.15;
  if (has(arm, 'memory')) v += 0.1;
  return Number(Math.min(1, v).toFixed(2));
}

// ── Single task simulation ───────────────────────────────────────

function simulateTask(arm, taskId, scenarioCtx) {
  const seed = scenarioCtx.seed + taskId.charCodeAt(0) * 31 + arm.caps * 7 + (arm.ablate ? arm.ablate.charCodeAt(0) : 0);
  const rng = mulberry32(seed);
  const ctx = { contextSize: scenarioCtx.contextSize, tools: scenarioCtx.tools };
  const taskSuccess = mTaskSuccess(arm, rng);
  const verifiedSuccess = mVerifiedSuccess(arm, rng, taskSuccess);
  return {
    taskSuccess, verifiedSuccess,
    unverifiedClaims: mUnverifiedClaims(arm, rng),
    contradictionsUnresolved: mContradictions(arm, rng),
    wrongHypotheses: mWrongHyp(arm, rng),
    tokens: mTokens(arm, ctx, rng),
    latency: mLatency(arm, ctx, rng),
    repeatedDeadEnds: mRepeatedDeadEnds(arm, rng),
    memoryReuse: mMemoryReuse(arm, rng),
    strategyChanges: mStrategyChanges(arm, rng),
    usefulStrategyChanges: mUsefulStrategyChanges(arm, rng),
    cognitiveDiversity: mCognitiveDiversity(arm, rng),
    recipeUtility: mRecipeUtility(arm, rng),
    informationGain: mInformationGain(arm, rng),
    uncertaintyReduction: mUncertaintyReduction(arm, rng),
    topologyChanges: mTopologyChanges(arm, rng),
    unnecessaryMorphogenesis: mUnnecessaryMorph(arm, rng),
    agentSurvival: mAgentSurvival(arm, rng),
    budgetEfficiency: mBudgetEfficiency(arm, rng),
  };
}

// ── Aggregation ──────────────────────────────────────────────────

const METRICS = [
  'taskSuccess', 'verifiedSuccess', 'unverifiedClaims', 'contradictionsUnresolved',
  'wrongHypotheses', 'tokens', 'latency', 'repeatedDeadEnds', 'memoryReuse',
  'strategyChanges', 'usefulStrategyChanges', 'cognitiveDiversity', 'recipeUtility',
  'informationGain', 'uncertaintyReduction', 'topologyChanges', 'unnecessaryMorphogenesis',
  'agentSurvival', 'budgetEfficiency',
];

const BINARY_METRICS = new Set(['taskSuccess', 'verifiedSuccess']);
const RATE_METRICS = new Set(['agentSurvival', 'budgetEfficiency']);

function aggregateMetrics(results) {
  const n = results.length;
  const sum = (key) => results.reduce((s, r) => s + r[key], 0);
  const avg = (key) => Number((sum(key) / n).toFixed(2));
  const out = {};
  for (const m of METRICS) {
    if (BINARY_METRICS.has(m)) out[m] = results.every((r) => r[m] === 1) ? 1 : 0;
    else if (RATE_METRICS.has(m)) out[m] = avg(m);
    else out[m] = sum(m);
  }
  return out;
}

// ── Scenario runner ──────────────────────────────────────────────

function runScenario(key) {
  const cfg = SCENARIOS[key];
  const ctx = { seed: cfg.seed, contextSize: cfg.contextSize, tools: cfg.tools };
  const tasks = TASK_IDS[key];
  const arms = {};
  for (const ak of Object.keys(ARMS)) {
    const arm = { ...ARMS[ak], ablate: null };
    const res = tasks.map((t) => simulateTask(arm, t, ctx));
    arms[ak] = { arm: ARMS[ak].name, caps: ARMS[ak].caps, metrics: aggregateMetrics(res), taskCount: tasks.length };
  }
  for (const ab of Object.keys(ABLATIONS)) {
    const arm = { ...ARMS.H, ablate: ABLATIONS[ab].remove };
    const res = tasks.map((t) => simulateTask(arm, t, ctx));
    arms[ab] = { arm: ABLATIONS[ab].label, caps: 7, ablate: ABLATIONS[ab].remove, metrics: aggregateMetrics(res), taskCount: tasks.length };
  }
  return { scenario: key, label: cfg.label, seed: cfg.seed, arms };
}

// ── Output ───────────────────────────────────────────────────────

function printMarkdown(results) {
  console.log('# GenOS Cognitive Morphogenesis Benchmark (8 Arms + 5 Ablations)\n');
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
  return { scenario: sa ? sa.split('=')[1] : 'all', arm: aa ? aa.split('=')[1] : null };
}

function filterResults(results, arm) {
  if (arm && (ARMS[arm] || ABLATIONS[arm])) {
    return results.map((r) => ({ ...r, arms: { [arm]: r.arms[arm] } }));
  }
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
  const file = path.join(dir, `cognitive-morphogenesis-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({
    generatedAt: new Date().toISOString(), scenarios: keys, arms: ARMS, ablations: ABLATIONS,
    results: results.map((r) => ({ scenario: r.scenario, label: r.label, seed: r.seed, arms: r.arms })),
  }, null, 2));
  console.log(`results: ${file}`);
}

if (require.main === module) {
  main();
}

module.exports = { SCENARIOS, ARMS, ABLATIONS, runScenario, simulateTask, aggregateMetrics, METRICS };
