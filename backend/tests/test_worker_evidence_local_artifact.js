'use strict';

const assert = require('node:assert/strict');
const { attachWorkerArtifact } = require('../src/services/workerEvidenceLocalArtifact');

const report = { outcome: 'success', claims: [], fullText: JSON.stringify({
  outcome: 'success',
  claims: [{ statement: 'The contract covers the API response.', evidence: ['mission:api-response'] }],
  scopeCompletion: { scopeRef: 'mission:api-response', completedRefs: ['mission:api-response'] }
}) };
attachWorkerArtifact(report, {
  mission: { workerKind: 'bounded_worker', localModel: 'test-model', workspaceRoot: 'workspace' },
  agentName: 'worker'
});

assert.equal(report.workerArtifact.type, 'dossier');
assert.equal(report.workerArtifact.content.claims[0].statement, 'The contract covers the API response.');
assert.equal(report.claims[0].statement, report.workerArtifact.content.claims[0].statement);

const invalid = { outcome: 'success', claims: [], fullText: '{"outcome":"success","claims":[]}' };
assert.throws(() => attachWorkerArtifact(invalid, {
  mission: { workerKind: 'bounded_worker' }, agentName: 'worker'
}), { code: 'INVALID_WORKER_ARTIFACT' });

process.stdout.write('Local worker artifacts validate the raw model reply and reject empty claims.\n');
