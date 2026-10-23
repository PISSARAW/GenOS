'use strict';

const assert = require('node:assert/strict');
const { attachWorkerArtifact } = require('../src/services/workerEvidenceLocalArtifact');
const { HYPOTHESES } = require('../src/services/agents/diagnosticMatrixContract');

const report = { outcome: 'success', claims: [], fullText: JSON.stringify({
  outcome: 'success',
  claims: [{ statement: 'The contract covers the API response.', evidence: ['mission:api-response'] }],
  scopeCompletion: { scopeRef: 'mission:api-response', completedRefs: ['mission:api-response'] }
}) };
attachWorkerArtifact(report, {
  mission: { workerKind: 'bounded_worker', localModel: 'test-model', workspaceRoot: 'workspace',
    allowedEvidenceRefs: ['mission:api-response'] },
  agentName: 'worker'
});

assert.equal(report.workerArtifact.type, 'dossier');
assert.equal(report.workerArtifact.content.claims[0].statement, 'The contract covers the API response.');
assert.equal(report.claims[0].statement, report.workerArtifact.content.claims[0].statement);

const codeReport = require('../src/services/workerCodeEvidenceReport').build({
  mission: { workspaceRoot: 'workspace' },
  proposal: { testStatus: 'passed', changedFileHashes: [{ path: 'index.html', hash: 'a'.repeat(64) }],
    tests: [{ command: 'npm test', exitCode: 0, signal: null, stdout: 'pass', stderr: '' }],
    testExecutionReceipt: { receiptHash: 'b'.repeat(64) } }
});
attachWorkerArtifact(codeReport, {
  codeWorker: true,
  proposal: { testExecutionReceipt: { receiptHash: 'b'.repeat(64) } },
  mission: { workerKind: 'bounded_worker', workspaceRoot: 'workspace' },
  agentName: 'code-worker'
});
assert.equal(codeReport.workerArtifact.type, 'dossier');
assert.match(codeReport.claims[0].evidence[0], /^genos:\/\/code-file\//);
assert(codeReport.workerArtifact.provenance.allowedEvidenceRefs.includes(
  `genos://code-test-execution/${'b'.repeat(64)}`));
const unboundReceipt = require('../src/services/workerCodeEvidenceReport').build({
  mission: { workspaceRoot: 'workspace' },
  proposal: { testStatus: 'passed', changedFileHashes: [{ path: 'index.html', hash: 'c'.repeat(64) }],
    tests: [{ command: 'npm test', exitCode: 0, signal: null, stdout: 'pass', stderr: '' }],
    testExecutionReceipt: { receiptHash: 'd'.repeat(64) } }
});
assert.throws(() => attachWorkerArtifact(unboundReceipt, {
  codeWorker: true, mission: { workerKind: 'bounded_worker', workspaceRoot: 'workspace' }
}), (error) => error.code === 'INVALID_WORKER_ARTIFACT'
  && error.workerArtifactDiagnostics.issues.some((issue) => issue.includes('code-test-execution')));
assert.throws(() => attachWorkerArtifact(unboundReceipt, {
  codeWorker: true, proposal: { testExecutionReceipt: { receiptHash: 'c'.repeat(64) } },
  mission: { workerKind: 'bounded_worker', workspaceRoot: 'workspace' }
}), (error) => error.code === 'INVALID_WORKER_ARTIFACT'
  && error.workerArtifactDiagnostics.issues.some((issue) => issue.includes('code-test-execution')),
'a report receipt that differs from the actual proposal receipt must remain unresolved');

const invalid = { outcome: 'success', claims: [], fullText: '{"outcome":"success","claims":[]}' };
assert.throws(() => attachWorkerArtifact(invalid, {
  mission: { workerKind: 'bounded_worker' }, agentName: 'worker'
}), { code: 'INVALID_WORKER_ARTIFACT' });

function matrixRow() {
  return { assessment: 'unresolved', predictedSignals: 'Measure the first request.',
    contradictoryObservations: 'The supplied CPU value is low.',
    discriminatingMeasurement: 'Compare cold and warm requests.', evidence: ['mission'] };
}

function diagnosticReply(matrix) {
  return { outcome: 'success', claims: [{ statement: 'No cause is established.', evidence: ['mission'] }],
    scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] }, diagnosticMatrix: matrix,
    conditionalVerdict: 'The cause remains unresolved pending measurements.',
    uncertainties: ['No per-layer timings were supplied.'] };
}

const matrix = Object.fromEntries(HYPOTHESES.map((key) => [key, matrixRow()]));
const diagnostic = { fullText: JSON.stringify(diagnosticReply(matrix)) };
attachWorkerArtifact(diagnostic, { mission: { workerKind: 'bounded_worker',
  prompt: 'Mission artifact=diagnostic_matrix' }, agentName: 'worker' });
assert.deepEqual(diagnostic.workerArtifact.content.diagnosticMatrix, matrix);

const incomplete = { fullText: JSON.stringify(diagnosticReply({ ...matrix, tlsSessionResumption: undefined })) };
assert.throws(() => attachWorkerArtifact(incomplete, { mission: { workerKind: 'bounded_worker',
  prompt: 'Mission artifact=diagnostic_matrix' }, agentName: 'worker' }), { code: 'INVALID_WORKER_ARTIFACT' });

process.stdout.write('Local worker artifacts preserve and validate required diagnostic matrices.\n');
