'use strict';

const assert = require('node:assert/strict');
const { build } = require('../src/services/workerCodeEvidenceReport');
const { inspectWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

function fixture(testStatus = 'passed') {
  return { mission: { workspaceRoot: 'C:/worker/scope', workerContract: {
    identity: { workerKind: 'bounded_worker' }, mission: { scope: 'scope://bounded-code' }
  } }, proposal: { testStatus, changedFileHashes: [{ path: 'src/answer.gexpr', hash: 'sha256:artifact' }],
    tests: [{ command: 'npm test', exitCode: 0, stdout: '264 cases passed', stderr: '' }] } };
}

const report = build(fixture());
assert.equal(report.outcome, 'success');
assert.equal(report.scopeCompletion.scopeRef, 'scope://bounded-code');
assert.equal(report.scopeCompletion.completedRefs.length, 1);
assert.equal(report.claims[0].evidence.length, 2);
const inspected = inspectWorkerArtifact('bounded_worker', report, {
  source: 'worker-inprocess-local', model: 'ollama://qwen2.5-coder:32b', workspaceRoot: 'C:/worker/scope'
});
assert.equal(inspected.artifact.type, 'dossier');
assert.deepEqual(inspected.artifact.content.scopeCompletion, report.scopeCompletion);
assert.throws(() => build({ ...fixture(), proposal: { ...fixture().proposal, changedFileHashes: [] } }),
  (error) => error.code === 'WORKER_CODE_EVIDENCE_INCOMPLETE');
assert.throws(() => build(fixture('failed')),
  (error) => error.code === 'WORKER_CODE_EVIDENCE_INCOMPLETE');
process.stdout.write('Bounded code worker evidence is derived from changed files and executed test results.\n');
