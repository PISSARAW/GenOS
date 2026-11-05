'use strict';
const assert = require('node:assert/strict');
const diagnostics = require('../src/services/codeBoundaryFailureDiagnostics');
const { noProgressError } = require('../src/services/workerCodeTestRepairProgress');
const { failurePayload } = require('../src/services/workerEvidenceBarrierLocalFailure');
const contract = { command: 'node .genos/boundary-check.cjs', visibleCommand: 'node visible.test.cjs' };
const secret = 'SYNTHETIC_DIAGNOSTIC_SENTINEL_DO_NOT_PUBLISH';

function testResult(extra = {}) {
  return { command: contract.command, exitCode: 1, signal: null, timedOut: false,
    stdout: '', stderr: 'AssertionError ERR_ASSERTION ' + secret, ...extra };
}
function generated(kind, extra = {}) {
  return testResult({ stdout: 'GENOS_BOUNDARY_RESULT:' + JSON.stringify({
    schema: 'genos.boundary-run-result/v1', status: 'failed', calls: 1, assertions: 1, cases: 0, kind,
    arbitrarySecret: secret }), ...extra });
}
function diagnostic(test, code = 'Q7_BOUNDARY_PATCH_FAILED') {
  const error = diagnostics.candidateFailure({ contract }, { tests: [test],
    testExecutionReceipt: { receiptHash: 'synthetic-unit-value' }, proposal: {} });
  error.code = code;
  return error.boundaryFailureDiagnostics;
}
function classifications() {
  const rows = [
    [generated('assertion'), 'assertion'],
    [generated('error'), 'runner_error'],
    [testResult({ timedOut: true, exitCode: -1 }), 'timeout'],
    [testResult({ signal: 'SIGTERM', exitCode: -1 }), 'signal'],
    [testResult({ stderr: 'spawn node ENOENT ' + secret }), 'spawn_error'],
    [testResult({ stderr: 'SyntaxError ' + secret }), 'syntax_error'],
    [testResult({ stderr: 'MODULE_NOT_FOUND ' + secret }), 'module_error'],
    [testResult({ stderr: 'unclassified ' + secret }), 'unknown'],
    [testResult({ exitCode: 0, stderr: '' }), 'passed']
  ];
  for (const [test, expected] of rows) {
    const value = diagnostic(test);
    assert.equal(value.tests[0].failureKind, expected);
    assert.equal(value.promoted, false);
    assert.equal(JSON.stringify(value).includes(secret), false);
  }
}
function propagation() {
  const error = diagnostics.candidateFailure({ contract }, { tests: [generated('assertion')], proposal: {},
    testExecutionReceipt: { receiptHash: 'synthetic-unit-value' } });
  const wrapped = noProgressError(error, { identicalFailures: 2 });
  const payload = failurePayload({ error: wrapped, executionRun: { id: 'synthetic-unit-run' }, mission: {} });
  assert.equal(payload.boundaryFailureDiagnostics, error.boundaryFailureDiagnostics);
  assert.equal(payload.boundaryFailureDiagnostics.sourceFailureCode, 'Q7_BOUNDARY_PATCH_FAILED');
  assert.equal(JSON.stringify(payload).includes(secret), false);
  assert.equal(diagnostics.project(JSON.parse(JSON.stringify(error.boundaryFailureDiagnostics))), undefined);
}
function contextFailures() {
  const state = { contract };
  const details = diagnostics.context(state, { tests: [testResult({ exitCode: 0, stderr: '' })] });
  const missing = diagnostics.attach(Object.assign(new Error('missing receipt'), { code: 'Q7_BOUNDARY_PATCH_FAILED' }), details);
  assert.equal(missing.boundaryFailureDiagnostics.missingReceipt, true);
  const io = diagnostics.attach(Object.assign(new Error(secret), { code: 'Q7_BOUNDARY_SOURCE_CHANGED',
    cause: { code: 'EACCES', message: secret } }));
  assert.equal(io.boundaryFailureDiagnostics.hostErrorCode, 'EACCES');
  assert.equal(io.boundaryFailureDiagnostics.origin, 'unknown');
  assert.equal(JSON.stringify(io.boundaryFailureDiagnostics).includes(secret), false);
  const proposal = diagnostics.proposalFailure('Q7_BOUNDARY_TEST_MISSING');
  assert.equal(proposal.boundaryFailureDiagnostics.origin, 'proposal');
  assert.equal(proposal.boundaryFailureDiagnostics.missingReceipt, false);
}
classifications(); propagation(); contextFailures();
console.log('PASS synthetic diagnostic classification, trusted projection, no-progress/terminal propagation and secret exclusion; no admission witness created');
