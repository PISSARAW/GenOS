'use strict';

const ARMS = Object.freeze([
  { id: 'solo', policy: 'solo' },
  { id: 'flat_parallel', policy: 'flat_parallel' },
  { id: 'a_team_without_handoffs', policy: 'a_team', handoffs: false },
  { id: 'a_team_without_repair', policy: 'a_team', repair: false },
  { id: 'a_team_full', policy: 'a_team', handoffs: true, repair: true }
]);

async function runBenchmark(input = {}) {
  if (!Array.isArray(input.scenarios) || !input.scenarios.length) throw coded('Benchmark scenarios are required.', 'ATEAM_BENCHMARK_SCENARIOS_REQUIRED');
  if (typeof input.executeCase !== 'function') throw coded('A real case executor is required.', 'ATEAM_BENCHMARK_EXECUTOR_REQUIRED');
  const repetitions = Math.max(1, Math.floor(Number(input.repetitions) || 1));
  const runs = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const scenario of input.scenarios) {
      for (const arm of rotatedArms(repetition, scenario.scenarioId)) {
        const outcome = await input.executeCase({ scenario, arm, repetition, seed: `${scenario.scenarioId}:${repetition}` });
        runs.push(normalizeRun({ scenario, arm, repetition, outcome }));
      }
    }
  }
  return { protocol: 'paired-counterbalanced-v1', repetitions, runs, arms: summarizeArms(runs), deltas: pairedDeltas(runs) };
}

function rotatedArms(repetition, scenarioId) {
  const offset = stableOffset(`${scenarioId}:${repetition}`);
  return [...ARMS.slice(offset), ...ARMS.slice(0, offset)];
}

function stableOffset(seed) {
  let value = 0;
  for (const character of seed) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % ARMS.length;
}

function normalizeRun({ scenario, arm, repetition, outcome = {} }) {
  const evidenceValid = outcome.evidenceValid === true;
  return {
    scenarioId: scenario.scenarioId, arm: arm.id, repetition,
    succeeded: outcome.succeeded === true && evidenceValid,
    evidenceValid,
    elapsedMs: finiteNonNegative(outcome.elapsedMs),
    tokenCost: finiteNonNegative(outcome.tokenCost)
  };
}

function summarizeArms(runs) {
  return Object.fromEntries(ARMS.map((arm) => {
    const entries = runs.filter((run) => run.arm === arm.id);
    return [arm.id, {
      sampleCount: entries.length,
      verifiedSuccessRate: ratio(entries.filter((run) => run.succeeded).length, entries.length),
      invalidEvidenceRate: ratio(entries.filter((run) => !run.evidenceValid).length, entries.length),
      meanElapsedMs: mean(entries.map((run) => run.elapsedMs)),
      meanTokenCost: mean(entries.map((run) => run.tokenCost))
    }];
  }));
}

function pairedDeltas(runs) {
  const baseline = new Map(runs.filter((run) => run.arm === 'solo').map((run) => [pairKey(run), run]));
  return Object.fromEntries(ARMS.filter((arm) => arm.id !== 'solo').map((arm) => {
    const pairs = runs.filter((run) => run.arm === arm.id).map((run) => [run, baseline.get(pairKey(run))]).filter((pair) => pair[1]);
    return [arm.id, {
      pairedSamples: pairs.length,
      verifiedSuccessDelta: mean(pairs.map(([current, prior]) => Number(current.succeeded) - Number(prior.succeeded))),
      tokenCostDelta: mean(pairs.map(([current, prior]) => current.tokenCost - prior.tokenCost)),
      elapsedMsDelta: mean(pairs.map(([current, prior]) => current.elapsedMs - prior.elapsedMs))
    }];
  }));
}

function pairKey(run) { return `${run.scenarioId}:${run.repetition}`; }
function finiteNonNegative(value) { return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0; }
function ratio(value, total) { return total ? value / total : null; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { ARMS, runBenchmark, summarizeArms, pairedDeltas };
