'use strict';

const trinityPareto = require('../backend/src/services/trinityParetoService');
const DIMENSIONS = ['correctness', 'coverage', 'robustness', 'reproducibility', 'novelty', 'cost', 'latency', 'risk', 'uncertainty', 'constraintCoverage'];

function optionsFromArgs(args) {
  const values = Object.fromEntries(args.map((arg) => arg.replace(/^--/, '').split('=')));
  return { seed: Number(values.seed || 42) >>> 0, iterations: boundedIterations(values.iterations) };
}

function boundedIterations(value) {
  const parsed = Number(value || 100);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(10000, parsed)) : 100;
}

function randomFor(seed) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function evidenceVector(values, id) {
  return {
    hardConstraintsPassed: true, budgetStatus: 'within', evidence: [{ id }],
    evidenceVector: values,
    evidenceVectorEvidence: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, [id]]))
  };
}

function profile(level, id) {
  return evidenceVector({
    correctness: level, coverage: level, robustness: level, reproducibility: level,
    novelty: level, cost: 1 - level, latency: 1 - level, risk: 1 - level,
    uncertainty: 1 - level, constraintCoverage: level
  }, id);
}

function scenario(index, nextRandom) {
  const kind = index % 4;
  const winner = Math.floor(nextRandom() * 3);
  if (kind === 0) return { expected: 'PROMOTE_WORLD', selected: winner + 1, worlds: dominantWorlds(winner, index) };
  if (kind === 1) return { expected: 'KEEP_PARETO_SET', selected: null, worlds: conflictingWorlds(index) };
  if (kind === 2) return { expected: 'PROMOTE_WORLD', selected: 1, worlds: gatedWorlds(index) };
  return { expected: 'ESCALATE_EXPERIMENT', selected: null, worlds: missingEvidenceWorlds(index) };
}

function dominantWorlds(winner, seed) {
  return [0, 1, 2].map((index) => ({
    worldNumber: index + 1,
    report: profile(index === winner ? 0.95 : index === (winner + 1) % 3 ? 0.82 : 0.74, `d_${seed}_${index}`)
  }));
}

function conflictingWorlds(seed) {
  const preferred = profile(0.90, `c_${seed}_1`);
  const lowRisk = profile(0.84, `c_${seed}_2`);
  preferred.evidenceVector.risk = 0.28;
  lowRisk.evidenceVector.correctness = 0.82;
  lowRisk.evidenceVector.risk = 0.08;
  return [
    { worldNumber: 1, report: preferred }, { worldNumber: 2, report: lowRisk },
    { worldNumber: 3, report: profile(0.70, `c_${seed}_3`) }
  ];
}

function gatedWorlds(seed) {
  const rejected = profile(0.99, `g_${seed}_3`);
  rejected.hardConstraintsPassed = false;
  return [
    { worldNumber: 1, report: profile(0.90, `g_${seed}_1`) },
    { worldNumber: 2, report: profile(0.80, `g_${seed}_2`) },
    { worldNumber: 3, report: rejected }
  ];
}

function missingEvidenceWorlds(seed) {
  const worlds = dominantWorlds(0, seed);
  worlds[2].report.evidenceVectorEvidence.correctness = [];
  return worlds;
}

function signature(result) {
  return `${result.outcome}:${result.selectedWorld || ''}:${(result.frontier || []).map((world) => world.worldNumber).join(',')}`;
}

function evaluateCase(item) {
  const first = trinityPareto.compare(item.worlds);
  const replay = trinityPareto.compare(item.worlds);
  return {
    expected: item.expected, actual: first.outcome,
    selected: first.selectedWorld || null, expectedSelected: item.selected,
    deterministic: signature(first) === signature(replay)
  };
}

function rate(numerator, denominator) { return denominator ? Number((numerator / denominator).toFixed(4)) : null; }

function calculateMetrics(results) {
  const promotions = results.filter((item) => item.actual === 'PROMOTE_WORLD');
  const falsePromotions = promotions.filter((item) => item.expected !== 'PROMOTE_WORLD');
  const correctPromotions = promotions.filter((item) => item.selected === item.expectedSelected);
  const promotionCases = results.filter((item) => item.expected === 'PROMOTE_WORLD').length;
  return {
    cases: results.length,
    falsePromotionRate: rate(falsePromotions.length, results.length),
    correctPromotionRate: rate(correctPromotions.length, promotionCases),
    paretoRetentionRate: rate(results.filter((item) => item.actual === 'KEEP_PARETO_SET').length, results.length),
    escalationRate: rate(results.filter((item) => item.actual === 'ESCALATE_EXPERIMENT').length, results.length),
    deterministicReplayRate: rate(results.filter((item) => item.deterministic).length, results.length)
  };
}

function run(options) {
  const nextRandom = randomFor(options.seed);
  const results = Array.from({ length: options.iterations }, (_, index) => evaluateCase(scenario(index, nextRandom)));
  return {
    benchmark: 'trinity-synthetic-pareto-v1', seed: options.seed, iterations: options.iterations,
    metrics: calculateMetrics(results),
    limitations: ['Synthetic evidence vectors only; does not measure model quality, real-world false promotions, or cross-provider diversity.']
  };
}

process.stdout.write(`${JSON.stringify(run(optionsFromArgs(process.argv.slice(2))), null, 2)}\n`);
