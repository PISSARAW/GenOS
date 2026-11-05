'use strict';
const runner = require('./codeBoundaryRunnerHost');
const { failure } = require('./trinityProvenanceValues');
const trusted = new WeakSet();
const IO_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EIO', 'ENOTDIR', 'ELOOP', 'SQLITE_BUSY', 'SQLITE_ERROR', 'SQLITE_MISUSE']);
const SOURCE_CODES = new Set([...IO_CODES, 'Q7_BOUNDARY_CONTRACT_INVALID', 'Q7_BOUNDARY_RECEIPT_CONTEXT_REQUIRED',
  'Q7_BOUNDARY_TEST_MISSING', 'Q7_BOUNDARY_TEST_COPIED', 'Q7_BOUNDARY_FORMAT_INVALID', 'Q7_BOUNDARY_DOMAIN_INVALID',
  'Q7_BOUNDARY_SOURCE_CHANGED', 'Q7_BOUNDARY_WORLD_INVALID', 'Q7_BOUNDARY_WORKSPACE_TOO_LARGE', 'Q7_BOUNDARY_PATCH_FAILED',
  'Q7_BOUNDARY_BASELINE_VISIBLE_FAILED', 'Q7_BOUNDARY_NON_DISCRIMINATING', 'Q7_BOUNDARY_WITNESS_UNTRUSTED',
  'Q7_BASELINE_ANCHOR_UNAVAILABLE', 'CODE_CANDIDATE_CAPTURE_FAILED']);

function hostErrorCode(error) {
  for (let depth = 0; error && depth < 4; depth += 1) {
    if (IO_CODES.has(error.code)) return error.code;
    error = error.cause;
  }
  return null;
}
function result(test) {
  const raw = runner.result(test);
  if (raw?.schema !== 'genos.boundary-run-result/v1') return null;
  const counts = [raw.calls, raw.assertions, raw.cases];
  if (!counts.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 10000)) return null;
  return { schema: raw.schema, calls: raw.calls, assertions: raw.assertions, cases: raw.cases,
    status: ['passed', 'failed'].includes(raw.status) ? raw.status : null,
    kind: ['assertion', 'error'].includes(raw.kind) ? raw.kind : null };
}
function failureKind(test, role) {
  if (test.timedOut === true) return 'timeout';
  if (test.signal) return 'signal';
  if (test.exitCode === 0) return 'passed';
  const observed = role.endsWith('generated') ? result(test) : null;
  if (observed) return observed.kind === 'assertion' && test.exitCode > 0 ? 'assertion' : 'runner_error';
  return outputKind(test);
}
function outputKind(test) {
  const output = String(test.stderr || '');
  if (/AssertionError/.test(output) && /ERR_ASSERTION/.test(output)) return 'assertion';
  if (/\bspawn\b.*\b(?:ENOENT|EACCES|EPERM)\b/.test(output)) return 'spawn_error';
  if (/\bSyntaxError\b/.test(output)) return 'syntax_error';
  if (/\bMODULE_NOT_FOUND\b|Cannot find module/.test(output)) return 'module_error';
  return result(test)?.status === 'failed' ? 'runner_error' : 'unknown';
}
function observation(role, test) {
  return { role, command: test.command,
    exitCode: Number.isInteger(test.exitCode) ? test.exitCode : null,
    signal: typeof test.signal === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(test.signal) ? test.signal : null,
    timedOut: typeof test.timedOut === 'boolean' ? test.timedOut : null,
    failureKind: failureKind(test, role), runnerResult: role.endsWith('generated') ? result(test) : null };
}
function context(state, input = {}) {
  const value = { stage: 'candidate_verification', origin: 'execution', tests: [],
    receiptPresence: { candidate: Boolean(input.testExecutionReceipt), baseline: false }, required: ['candidate'] };
  for (const test of input.tests || []) {
    if (test.command === state.contract.visibleCommand) value.tests.push(observation('candidate_visible', test));
    if (test.command === state.contract.command) value.tests.push(observation('candidate_generated', test));
  }
  return value;
}
function stage(state, value) { state.failureContext.stage = value; }
function observed(state, role, test) { state.failureContext.tests.push(observation(role, test)); }
function empty(origin = 'unknown') {
  return { stage: 'capture', origin, tests: [], receiptPresence: { candidate: false, baseline: false }, required: [] };
}
function attach(error, details = empty()) {
  if (project(error.boundaryFailureDiagnostics)) return error;
  const diagnostic = { schema: 'genos.boundary-failure-diagnostics/v1', promoted: false,
    sourceFailureCode: SOURCE_CODES.has(error.code) ? error.code : null,
    stage: details.stage, origin: details.origin, tests: details.tests, receiptPresence: { ...details.receiptPresence },
    missingReceipt: details.required.some(name => !details.receiptPresence[name]), hostErrorCode: hostErrorCode(error) };
  trusted.add(diagnostic);
  error.boundaryFailureDiagnostics = diagnostic;
  return error;
}
function proposalFailure(code) { return attach(failure(code), empty('proposal')); }
function project(value) { return trusted.has(value) ? value : undefined; }
function candidateFailure(state, input) {
  const error = Object.assign(new Error('Candidate boundary contract tests failed.'), {
    code: 'Q7_BOUNDARY_PATCH_FAILED', proposal: input.proposal });
  const details = context(state, input);
  details.stage = 'candidate_tests';
  return attach(error, details);
}
module.exports = { attach, project, context, stage, observed, candidateFailure, proposalFailure };
