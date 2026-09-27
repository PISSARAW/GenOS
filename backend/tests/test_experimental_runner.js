'use strict';

const assert = require('assert');
const { runIsolatedExperiment } = require('../src/services/experimentalRunnerService');

async function main() {
  const spec = {
    experimentId: 'lot04-real-run', hypothesis: 'the intervention changes the selected solver', seeds: [11, 29],
    budget: { maxRuns: 4, maxRounds: 2 },
    control: { problemSpec: { id: 'control', cases: [{ id: 'c1', values: [1, 2, 3], target: 2 }] }, solverKeys: ['beam_solver'] },
    intervention: { problemSpec: { id: 'intervention', cases: [{ id: 'i1', values: [1, 2, 3], target: 3 }] }, solverKeys: ['beam_solver'] },
  };
  const result = await runIsolatedExperiment(spec);
  assert.strictEqual(result.arms.control.length, 2);
  assert.strictEqual(result.arms.intervention.length, 2);
  assert.strictEqual(result.budget.consumedRuns, 4);
  assert.strictEqual(result.isolation.sharedState, false);
  assert.strictEqual(result.receipt.contractType, 'CausalInterventionReceipt');
  assert.strictEqual(result.receipt.payload.replicates, 2);
  assert.ok(result.nondeterminism.agreementRate >= 0.5);
  await assert.rejects(() => runIsolatedExperiment({ ...spec, budget: { maxRuns: 2, maxRounds: 2 } }), (error) => error.code === 'BUDGET_EXCEEDED');
  console.log('✅ experimental runner tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
