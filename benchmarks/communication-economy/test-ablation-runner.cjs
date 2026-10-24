'use strict';

const assert = require('node:assert/strict');
const { MECHANISMS, runAblationCampaign } = require('./ablation-runner.cjs');

const taskSet = [{ id: 'task-1' }];
const baseline = { tasks: [{ taskId: 'task-1', verifiedAction: true, informationLost: false,
  episodeCostUsd: 1, usage: { usageCoverage: 'complete' } }] };
async function run(input) {
  return { appliedAblation: input.disabledMechanism,
    trial: { ...baseline, armId: input.disabledMechanism, tasks: [...baseline.tasks] } };
}

runAblationCampaign({ taskSet, baseline, scenario: 'pilot-10x100', seed: 7, run })
  .then((result) => {
    assert.equal(result.ablations.length, 5);
    assert.deepEqual(result.ablations.map((row) => row.mechanism), [...MECHANISMS]);
    return runAblationCampaign({ taskSet, baseline, run: async () => ({
      appliedAblation: 'wrong-mechanism', trial: baseline }) });
  })
  .then(() => { throw new Error('Unconfirmed ablation unexpectedly succeeded.'); })
  .catch((error) => {
    assert.match(error.message, /did not confirm ablation/);
    console.log('communication-economy executed ablations: ok');
  });
