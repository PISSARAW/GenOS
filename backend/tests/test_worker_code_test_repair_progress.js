'use strict';

const assert = require('node:assert/strict');
const { run } = require('../src/services/workerCodeTestRepair');
const { failureSignature } = require('../src/services/workerCodeTestRepairProgress');

const mission = { localCodeWorker: true, prompt: 'Repair a pantry app.', timeoutMs: 10000,
  executionBudget: { latencyMs: 10000, tokens: 20000 } };
function failure(stderr, content = '<main></main>') {
  return Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: {
    tests: [{ command: 'npm test', exitCode: 1, stderr }],
    failedPatchContents: [{ path: 'index.html', content }]
  }, usage: { tokens: 50 } });
}

module.exports = async function testRepairProgress() {
  const visibleCountFailure = failure('Expected one visible match; 2 !== 1 at tests/acceptance.cjs:19:10');
  const signature = JSON.parse(failureSignature(visibleCountFailure));
  assert.equal(signature.diagnostic, 'assertion-count@19:2!==1');
  assert.doesNotMatch(failureSignature(visibleCountFailure), /Oats/i);
  const normalizedFailure = failure('Expected one visible match; 2 !== 1 at tests/acceptance.cjs:19:10');
  normalizedFailure.proposal.tests[0].command = ' npm test ';
  normalizedFailure.proposal.tests[0].exitCode = '1';
  assert.equal(failureSignature(normalizedFailure), failureSignature(visibleCountFailure));

  let attempts = 0;
  let stopped;
  await assert.rejects(run({ mission, runAttempt: async () => {
    attempts += 1;
    throw failure('missing Category label');
  } }), (error) => { stopped = error; return error.code === 'WORKER_TEST_REPAIR_NO_PROGRESS'; });
  assert.equal(attempts, 2);
  assert.equal(stopped.repairProgress.identicalFailures, 2);
  assert.match(stopped.repairProgress.candidateDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(stopped.repairProgress.appliedPlanIds, []);

  let rewrites = 0;
  await assert.rejects(run({ mission, runAttempt: async () => {
    rewrites += 1;
    throw failure('missing Category label', `<main data-revision="${rewrites}"></main>`);
  } }), (error) => error.code === 'WORKER_TEST_REPAIR_NO_PROGRESS');
  assert.equal(rewrites, 2, 'candidate rewrites alone do not reset an identical failure');

  let planAttempts = 0;
  let plans;
  const planResult = await run({ mission, runAttempt: async (attemptMission) => {
    planAttempts += 1;
    if (planAttempts === 1) throw failure('2 !== 1 at acceptance.cjs:19:10');
    if (planAttempts === 2) throw failure('2 !== 1 at acceptance.cjs:19:10',
      '<td aria-label="Item name">Kale</td>');
    plans = attemptMission.codeRepairPlans;
    return 'repair plan advanced';
  } });
  assert.equal(planResult, 'repair plan advanced');
  assert.equal(planAttempts, 3);
  assert.deepEqual(plans, [{ kind: 'ensure_unique_item_name_locator', label: 'Item name' }]);

  let signatureAttempts = 0;
  const signatureResult = await run({ mission, runAttempt: async () => {
    signatureAttempts += 1;
    if (signatureAttempts === 1) throw failure('getByLabel(/^category$/i) timeout');
    if (signatureAttempts === 2) throw failure('getByLabel(/search/i) timeout');
    return 'new failure signature';
  } });
  assert.equal(signatureResult, 'new failure signature');
  assert.equal(signatureAttempts, 3, 'a changed locator signature permits another repair attempt');
  console.log('Code worker repair progress checks passed.');
};
