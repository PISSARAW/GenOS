'use strict';

const assert = require('node:assert/strict');
const { run, repairPrompt, failureFeedback, locatorRepairHint, repairPlan,
  applyRepairPlan } = require('../src/services/workerCodeTestRepair');
const { throwIfFailed } = require('../src/services/workerEvidenceBarrierLocalTestFailure');
const { fromModelResult } = require('../src/services/workerEvidenceBarrierLocalSchemaFailure');

const mission = { localCodeWorker: true, prompt: 'Build the pantry app.', timeoutMs: 10000,
  executionBudget: { latencyMs: 10000, tokens: 20000 } };
const failed = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: {
  tests: [{ command: 'npm test', exitCode: 1, stderr: 'missing Category label' }],
  failedPatchContents: [{ path: 'index.html', content: '<h1>Existing Pantry</h1>' }]
}, usage: { inputTokens: 1200, outputTokens: 800, tokens: 2000 } });
assert.throws(() => throwIfFailed({ testStatus: 'failed', tests: [] },
	{ inputTokens: 1200, outputTokens: 800 }, 2000), (error) => {
	assert.equal(error.code, 'WORKER_TESTS_FAILED');
	assert.equal(error.usage.tokens, 2000);
	return true;
});

(async () => {
  const schemaFailure = fromModelResult({ schemaViolation: {
    error: 'Model output did not satisfy the requested worker evidence schema.',
    violations: ['/patches must contain at least 1 valid item(s)']
  }, text: '{"patches":[]}', inputTokens: 100, outputTokens: 50 });
  assert.equal(schemaFailure.code, 'WORKER_OUTPUT_SCHEMA_VIOLATION');
  assert.equal(schemaFailure.usage.tokens, 150);
  const schemaPrompts = [];
  const schemaRepair = await run({ mission, runAttempt: async (attemptMission) => {
    schemaPrompts.push(attemptMission);
    if (schemaPrompts.length === 1) throw schemaFailure;
    return 'schema repaired';
  } });
  assert.equal(schemaRepair, 'schema repaired');
  assert.equal(schemaPrompts[1].executionBudget.tokens, 19850);
  assert.match(schemaPrompts[1].prompt, /WORKER_OUTPUT_SCHEMA_VIOLATION/);
  assert.match(schemaPrompts[1].prompt, /at least 1 valid item/);
  assert.match(schemaPrompts[1].prompt, /\{"patches":\[\]\}/);

  const prompts = [];
  let retries = 0;
  const result = await run({ mission, onRetry: () => { retries += 1; },
    runAttempt: async (attemptMission) => {
      prompts.push(attemptMission.prompt);
      if (prompts.length === 2) assert.equal(attemptMission.executionBudget.tokens, 18000);
      if (prompts.length === 1) throw failed;
      return 'passed';
    } });
  assert.equal(result, 'passed');
  assert.equal(retries, 1);
  assert.match(prompts[1], /rolled back/i);
  assert.match(repairPrompt({ mission, error: failed, attempt: 1 }), /Repair attempt 1 of 4/);
  assert.match(prompts[1], /missing Category label/);
  assert.match(prompts[1], /Existing Pantry/);
  assert.match(repairPrompt({ mission, error: failed, attempt: 1 }), /npm test/);
  assert.match(failureFeedback(failed), /Exit code: 1/);
  const categoryFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'locator.selectOption: Timeout 4000ms exceeded. waiting for getByLabel(/^category$/i)'
  }] }, usage: { inputTokens: 25, outputTokens: 25, tokens: 50 } });
  assert.match(locatorRepairHint(categoryFailure), /<label for="category">Category<\/label>/);
  assert.match(failureFeedback(categoryFailure), /label that control Filter category/);
  assert.ok(failureFeedback(categoryFailure).indexOf('exact accessible Category control')
    < failureFeedback(categoryFailure).indexOf('locator.selectOption'));
  const plan = repairPlan(categoryFailure);
  assert.deepEqual(plan, { kind: 'ensure_accessible_select_label', label: 'Category' });
  const buttonFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: "locator.click: waiting for getByRole('button', { name: /increase quantity for oats/i })"
  }] }, usage: { tokens: 50 } });
  const buttonPlan = repairPlan(buttonFailure);
  assert.deepEqual(buttonPlan, { kind: 'ensure_accessible_button_label', label: 'Increase quantity for Oats' });
  assert.match(locatorRepairHint(buttonFailure), /aria-label="Increase quantity for Oats"/);
  const proposalText = JSON.stringify({ format: 'genos.file-replacement/v1', patches: [{
    path: 'index.html', content: '<form><select id="category"><option value="Food">Food</option></select><button>+</button><button>Delete Oats</button></form>'
  }], tests: ['npm test'], evidence: 'test fixture' });
  const repairedText = applyRepairPlan(proposalText, [plan, buttonPlan]);
  const repairedContent = JSON.parse(repairedText).patches[0].content;
  assert.match(repairedContent,
    /<select id="category" aria-label="Category">/);
  assert.match(repairedContent, /<button aria-label="Increase quantity for Oats">\+/);
  assert.match(repairedContent, /<button>Delete Oats<\/button>/);
  assert.equal(applyRepairPlan(repairedText, plan), repairedText);
  let repairPlanAttempts = 0;
  await run({ mission, runAttempt: async (attemptMission) => {
    repairPlanAttempts += 1;
    if (repairPlanAttempts === 1) throw categoryFailure;
    if (repairPlanAttempts === 2) throw buttonFailure;
    assert.deepEqual(attemptMission.codeRepairPlans, [plan, buttonPlan]);
    return 'repaired';
  } });
  assert.equal(repairPlanAttempts, 3);
  const oatsFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stdout: 'CANDIDATE index.html true 5000',
    stderr: 'AssertionError: 0 !== 1 at tests/acceptance.cjs:19:10'
  }] }, usage: { tokens: 50 } });
  assert.match(locatorRepairHint(oatsFailure), /append the form values to the shared items collection/);
  assert.match(failureFeedback(oatsFailure), /append the form values to the shared items collection/);
  const duplicateFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'AssertionError: 2 !== 1 at tests/acceptance.cjs:19:10'
  }] }, usage: { tokens: 50 } });
  assert.match(locatorRepairHint(duplicateFailure), /2 visible text matches for Oats/);

  let attempts = 0;
  await assert.rejects(run({ mission, runAttempt: async () => {
    attempts += 1;
    throw failed;
  } }), /test failed/);
  assert.equal(attempts, 5);

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
