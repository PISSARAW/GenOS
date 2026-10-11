'use strict';

const assert = require('node:assert/strict');
const { verifiedResult, summarizeCompliance, summarizePerception } = require('./workerComplianceSummary.cjs');

const kinds = ['bounded_worker', 'procedural_executor', 'formal_worker'];
const artifacts = ['dossier', 'dossier', 'formal_certificate'];
const results = kinds.map((kind, index) => ({
  runId: 'qualification-1', kind, workerId: `worker-${index}`,
  persistedContract: true, parentBound: true, runtimeStarted: true, executionRunBound: true,
  status: 'completed', terminalEvent: 'AGENT_COMPLETED', outcome: 'success',
  expectedArtifact: artifacts[index], artifact: artifacts[index],
  artifactValidated: true, nativeExecution: true, oracleAccepted: true,
  sourceEvidenceValidated: true, refusalsValidated: true,
  passed: true, errorCode: null, error: null
}));

assert.equal(verifiedResult(results[0]), true);
assert.deepEqual(summarizeCompliance(results, kinds), {
  executed: 3, unavailable: 0, failed: 0, accepted: true
});

function rejectsReplacement(index, replacement) {
  const changed = [...results];
  changed[index] = { ...changed[index], ...replacement };
  assert.equal(summarizeCompliance(changed, kinds).accepted, false);
}

rejectsReplacement(2, { passed: false, status: 'error', errorCode: 'WORKER_EXECUTOR_UNAVAILABLE' });
rejectsReplacement(2, { passed: true, errorCode: 'WORKER_EXECUTOR_UNAVAILABLE' });
rejectsReplacement(2, { runtimeStarted: false });
rejectsReplacement(2, { executionRunBound: false });
rejectsReplacement(2, { status: 'running' });
rejectsReplacement(2, { terminalEvent: 'AGENT_FAILED' });
rejectsReplacement(2, { artifact: 'dossier' });
rejectsReplacement(2, { artifactValidated: false });
rejectsReplacement(2, { oracleAccepted: false });
rejectsReplacement(2, { nativeExecution: false, oracleAccepted: true });
rejectsReplacement(2, { sourceEvidenceValidated: false });
rejectsReplacement(2, { refusalsValidated: false });
rejectsReplacement(2, { runId: 'another-run' });
rejectsReplacement(2, { workerId: '' });
assert.equal(summarizeCompliance([results[0], results[0], results[2]], kinds).accepted, false);
assert.equal(summarizeCompliance([{ kind: kinds[0], passed: true }, results[1], results[2]], kinds).accepted, false);
assert.equal(summarizeCompliance(results.slice(0, 2), kinds).accepted, false);
assert.equal(summarizeCompliance([...results, results[2]], kinds).accepted, false);
assert.deepEqual(summarizeCompliance([
  results[0], results[1], { ...results[2], passed: false, status: 'error', errorCode: 'WORKER_EXECUTOR_UNAVAILABLE' }
], kinds), { executed: 2, unavailable: 1, failed: 1, accepted: false });

const perceived = results.map((entry) => ({ ...entry, perception: {
  observerAvailable: true, observedCount: 2, telemetryCount: 2, distinctDigests: 2,
  planRevision: 2, runBound: true, executionRunBound: true, runtimeSettled: true
} }));
assert.deepEqual(summarizePerception(perceived, kinds), { observed: 3, failed: 0, accepted: true });
assert.equal(summarizePerception([perceived[0], perceived[0], perceived[2]], kinds).accepted, false);
assert.equal(summarizePerception([perceived[0], perceived[1], { ...perceived[2], runId: 'old-run' }], kinds).accepted, false);
assert.equal(summarizePerception([perceived[0], perceived[1], { ...perceived[2], perception: {
  ...perceived[2].perception, telemetryCount: 1
} }], kinds).accepted, false);
assert.equal(summarizePerception([perceived[0], perceived[1], { ...perceived[2], perception: {
  ...perceived[2].perception, executionRunBound: false
} }], kinds).accepted, false);

console.log('Worker compliance requires every kind to execute with current, typed evidence: PASS');
