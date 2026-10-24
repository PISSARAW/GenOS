'use strict';

const assert = require('node:assert/strict');
const manifest = require('./manifest.json');
const { REGISTERED_ARMS, EXECUTABLE_ARMS, INTERVENTION_TRIPLET, runScenario } = require('./run-v2-06.cjs');
const { runnerDescriptor } = require('./runner-registry.cjs');

async function run() {
  assert.deepEqual(REGISTERED_ARMS, manifest.comparisonArms['V2-06']);
  assert.deepEqual(EXECUTABLE_ARMS, []);
  assert.deepEqual(runnerDescriptor('V2-06').arms, REGISTERED_ARMS);
  assert.deepEqual(runnerDescriptor('V2-06').executableArms, []);
  assert.deepEqual(Object.fromEntries(Object.entries(INTERVENTION_TRIPLET).map(([arm, treatment]) => [arm, treatment.mode])), {
    'genos-full': 'baseline', 'genos-social-memory-ablated': 'mask-social-memories',
    'genos-social-memory-counterfactual': 'counterfactual-social-memories',
  });
  let comparison;
  for (const arm of REGISTERED_ARMS) {
    const result = await runScenario({ seed: manifest.seeds[0], arm, attempt: 1, sourceCommit: 'test-commit' });
    assert.equal(result.report.status, 'inconclusive');
    assert.equal(result.report.oracle.recalculable, false);
    assert.deepEqual(result.report.evidenceRefs, []);
    assert.equal(result.evidence.captureAccepted, false);
    assert.match(result.report.oracle.reason, /Missing runtime capture fields/);
    if (comparison) assert.deepEqual(result.comparison, comparison);
    comparison = result.comparison;
    assert.deepEqual(result.report.inputs.registeredArms, REGISTERED_ARMS);
    assert.deepEqual(result.report.inputs.interventionTriplet, INTERVENTION_TRIPLET);
  }
}

run().then(() => process.stdout.write('V2-06 registers all manifest arms and refuses synthetic runtime proof\n'))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
