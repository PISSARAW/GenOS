'use strict';

const assert = require('node:assert/strict');
const { classifyWorker, diagnosticLines, missingWorkerDiagnostics, parseWorkerRecord } = require('../../benchmarks/topology-morphogenesis/diagnose-worker-outcomes.cjs');

function testClassifiesStorageFailure() {
  const content = '[TelemetryObserver] Event persistence failed: SQLITE_FULL: database or disk is full';
  assert.deepEqual(classifyWorker('error', diagnosticLines(content)), ['storage_exhausted']);
}

function testSeparatesBlockedWorkerWithoutCause() {
  assert.deepEqual(classifyWorker('blocked', []), ['blocked_without_runtime_reason']);
}

function testReadsLatestWorkerReceipt() {
  const record = parseWorkerRecord(JSON.stringify({ workerId: 'w-1', agents: [{ id: 'w-1', status: 'error' }] }));
  assert.equal(record.agents[0].status, 'error');
}

function testReportsWorkersWithoutLogs() {
  const results = { missions: [{ name: 'topologie-test', workers: [{ id: 'w-missing', status: 'blocked' }] }] };
  const missing = missingWorkerDiagnostics(results, new Set());
  assert.deepEqual(missing[0].causes, ['worker_log_missing']);
  assert.equal(missing[0].status, 'blocked');
}

testClassifiesStorageFailure();
testSeparatesBlockedWorkerWithoutCause();
testReadsLatestWorkerReceipt();
testReportsWorkersWithoutLogs();
console.log('Campaign worker diagnostics tests passed.');
