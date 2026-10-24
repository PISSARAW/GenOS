'use strict';

const assert = require('node:assert/strict');
const strategyExecution = require('../src/services/strategyExecutionService');
const {
  classifyFailure, candidateDiagnostics, buildFailureDiagnostics, candidateChanged, publish
} = require('../src/services/workerCodeTestRepairTelemetry');
const { throwIfFailed } = require('../src/services/workerEvidenceBarrierLocalTestFailure');

function failure(code, stderr, message = 'test failed') {
  return { code, message, proposal: { tests: [{ command: 'npm test', exitCode: 1, stderr }] } };
}

assert.equal(classifyFailure(failure('WORKER_OUTPUT_SCHEMA_VIOLATION', 'invalid JSON')), 'schema_rejection');
assert.equal(classifyFailure(failure('MODEL_ROUTE_DEADLINE_EXCEEDED', 'route deadline exceeded')), 'model_provider_timeout');
assert.equal(classifyFailure(failure('WORKER_TEST_ENVIRONMENT_FAILED', 'temp root unavailable')), 'test_environment_unavailable');
assert.equal(classifyFailure(failure('WORKER_TESTS_FAILED', 'browserType.launch: ENOSPC; Failed to create initial profile')), 'browser_disk_enospc');
assert.equal(classifyFailure(failure('WORKER_TESTS_FAILED', 'browserType.launch: Target page, context or browser has been closed')), 'browser_launch_failure');
assert.equal(classifyFailure(failure('WORKER_TESTS_FAILED', 'locator.fill: strict mode violation; getByLabel(/quantity/) resolved to 2 elements')), 'app_locator_failure');
assert.equal(classifyFailure(failure('WORKER_TESTS_FAILED', 'AssertionError: Expected values to be strictly equal: 2 !== 1')), 'app_assertion_failure');
assert.equal(classifyFailure(failure('WORKER_TESTS_FAILED', 'unexpected exit code')), 'app_test_failure');

const html = '<label for="quantity">Quantity</label><input id="quantity" name="qty" aria-label="Quantity">'
  + '<label for="quantity">Quantity</label><button id="quantity" name="qty" aria-label="Quantity">+</button>';
const proposal = { failedPatchContents: [{ path: 'index.html', content: html }] };
const diagnostics = candidateDiagnostics({ proposal });
assert.match(diagnostics.candidateDigest, /^[a-f0-9]{64}$/);
assert.equal(diagnostics.candidateFiles[0].duplicateIds[0].value, 'quantity');
assert.equal(diagnostics.candidateFiles[0].duplicateLabelTargets[0].count, 2);
assert.equal(diagnostics.candidateFiles[0].duplicateLabels[0].value, 'Quantity');
assert.equal(diagnostics.candidateFiles[0].duplicateControlNames[0].value, 'qty');
assert.equal(diagnostics.candidateFiles[0].duplicateAccessibleNames[0].value, 'Quantity');
assert.equal(candidateDiagnostics({ proposal: { failedPatchContents: [
  { path: 'b.js', content: 'b' }, { path: 'a.js', content: 'a' }
] } }).candidateDigest, candidateDiagnostics({ proposal: { failedPatchContents: [
  { path: 'a.js', content: 'a' }, { path: 'b.js', content: 'b' }
] } }).candidateDigest);
assert.equal(candidateChanged('same', 'same'), false);
assert.equal(candidateChanged('old', 'new'), true);
assert.equal(candidateChanged(null, 'new'), null);

const wrapped = Object.assign(new Error('local worker test failure'), {
  code: 'WORKER_TESTS_FAILED', proposal: { testStatus: 'failed', rolledBack: false,
    failedPatchContents: [{ path: 'index.html', content: html }],
    tests: [{ command: 'npm test', exitCode: 1, stderr: 'locator.fill: strict mode violation' }] }
});
assert.throws(() => throwIfFailed(wrapped.proposal, { inputTokens: 3, outputTokens: 2 }, 5), (error) => {
  assert.equal(error.failureDiagnostics.schema, 'genos.worker-code-failure/v1');
  assert.equal(error.failureDiagnostics.category, 'app_locator_failure');
  assert.match(error.failureDiagnostics.candidate.candidateDigest, /^[a-f0-9]{64}$/);
  assert.equal(error.failureDiagnostics.candidate.candidateChanged, null);
  return true;
});

async function verifyPublishedProgress() {
  const priorDigest = 'a'.repeat(64);
  const previous = { payload_json: JSON.stringify({ candidateDigest: priorDigest }) };
  const captured = [];
  const original = strategyExecution.recordExecutionEvent;
  strategyExecution.recordExecutionEvent = async (_db, _agentId, event) => captured.push(event);
  try {
    await publish({ db: { all: async () => [previous] }, mission: { agentId: 'diagnostic-test-agent' },
      failedAttempt: 2, remainingMs: 1000, error: wrapped });
  } finally {
    strategyExecution.recordExecutionEvent = original;
  }
  const payload = captured[0].payload;
  assert.equal(payload.failureDiagnostics.category, 'app_locator_failure');
  assert.equal(payload.candidateChanged, true);
  assert.equal(payload.candidateDigest, payload.failureDiagnostics.candidate.candidateDigest);
}

verifyPublishedProgress().then(() => console.log('Worker code failure classification and candidate diagnostics checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
