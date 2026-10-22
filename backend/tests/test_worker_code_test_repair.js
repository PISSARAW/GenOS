'use strict';

const assert = require('node:assert/strict');
const { run, repairPrompt, failureFeedback } = require('../src/services/workerCodeTestRepair');

const mission = { localCodeWorker: true, prompt: 'Build the pantry app.', timeoutMs: 10000,
  executionBudget: { latencyMs: 10000, tokens: 20000 } };
const failed = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: {
  tests: [{ command: 'npm test', exitCode: 1, stderr: 'missing Category label' }],
  failedPatchContents: [{ path: 'index.html', content: '<h1>Existing Pantry</h1>' }]
} });

(async () => {
  const prompts = [];
  let retries = 0;
  const result = await run({ mission, onRetry: () => { retries += 1; },
    runAttempt: async (attemptMission) => {
      prompts.push(attemptMission.prompt);
      if (prompts.length === 1) throw failed;
      return 'passed';
    } });
  assert.equal(result, 'passed');
  assert.equal(retries, 1);
  assert.match(prompts[1], /rolled back/i);
  assert.match(prompts[1], /missing Category label/);
  assert.match(prompts[1], /Existing Pantry/);
  assert.match(repairPrompt({ mission, error: failed, attempt: 1 }), /npm test/);
  assert.match(failureFeedback(failed), /Exit code: 1/);

  let attempts = 0;
  await assert.rejects(run({ mission, runAttempt: async () => {
    attempts += 1;
    throw failed;
  } }), /test failed/);
  assert.equal(attempts, 3);

  let nonTestAttempts = 0;
  await assert.rejects(run({ mission, runAttempt: async () => {
    nonTestAttempts += 1;
    throw new Error('model unavailable');
  } }), /model unavailable/);
  assert.equal(nonTestAttempts, 1);

  let nonCodeAttempts = 0;
  await assert.rejects(run({ mission: { ...mission, localCodeWorker: false }, runAttempt: async () => {
    nonCodeAttempts += 1;
    throw failed;
  } }), /test failed/);
  assert.equal(nonCodeAttempts, 1);
  console.log('Local code worker repair loop checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
