'use strict';

const assert = require('node:assert/strict');
const { runBenchmark } = require('../../benchmarks/ateam/benchmarkRunner.cjs');

async function run() {
  const calls = [];
  const result = await runBenchmark({
    scenarios: [{ scenarioId: 'api-release' }, { scenarioId: 'data-import' }], repetitions: 2,
    executeCase: async ({ scenario, arm, repetition }) => {
      calls.push(`${scenario.scenarioId}:${repetition}:${arm.id}`);
      return { succeeded: arm.id !== 'solo', evidenceValid: arm.id !== 'a_team_without_handoffs', elapsedMs: 100, tokenCost: 50 };
    }
  });
  assert.equal(result.protocol, 'paired-counterbalanced-v1');
  assert.equal(result.runs.length, 20);
  assert.equal(result.arms.a_team_full.verifiedSuccessRate, 1);
  assert.equal(result.arms.a_team_without_handoffs.verifiedSuccessRate, 0);
  assert.equal(result.deltas.a_team_full.pairedSamples, 4);
  assert.equal(calls.length, 20);
  await assert.rejects(runBenchmark({ scenarios: [] }), { code: 'ATEAM_BENCHMARK_SCENARIOS_REQUIRED' });
}

run().then(() => console.log('A-Team benchmark harness pairs arms and gates success on evidence.'))
  .catch((error) => { console.error(error); process.exit(1); });
