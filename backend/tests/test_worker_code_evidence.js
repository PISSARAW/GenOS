'use strict';

const assert = require('node:assert/strict');
const { build } = require('../src/services/workerCodeEvidenceReport');
const { inspectWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
const { kindArtifactIsInvalid } = require('../src/services/agents/workerArtifactKindRules');

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

function typedFixture(workerKind, mission) {
  const input = fixture();
  input.mission.workerContract.identity.workerKind = workerKind;
  input.mission.workerContract.mission = { ...input.mission.workerContract.mission, ...mission };
  return input;
}

const specialistReport = build(typedFixture('specialist', { specialtyNiche: 'software_engineering' }));
const specialistArtifact = inspectWorkerArtifact('specialist', specialistReport, {
  allowedEvidenceRefs: specialistReport.claims[0].evidence
}).artifact;
assert.equal(specialistArtifact.content.specialtyAssessment.niche, 'software_engineering');
assert.equal(kindArtifactIsInvalid({ kind: 'specialist', type: 'dossier',
  content: specialistArtifact.content, contract: { mission: { specialtyNiche: 'software_engineering' } } }), false);

const adaptiveReport = build(typedFixture('adaptive_worker', { methodContract: { methodId: 'prompt_defined' } }));
const adaptiveArtifact = inspectWorkerArtifact('adaptive_worker', adaptiveReport, {
  allowedEvidenceRefs: adaptiveReport.claims[0].evidence
}).artifact;
assert.equal(adaptiveArtifact.content.strategyTrace[0].strategy, 'prompt_defined');
assert.equal(kindArtifactIsInvalid({ kind: 'adaptive_worker', type: 'dossier',
  content: adaptiveArtifact.content }), false);

assert.throws(() => build(typedFixture('specialist', {})),
  (error) => error.code === 'WORKER_CODE_EVIDENCE_INCOMPLETE');
assert.throws(() => build(typedFixture('adaptive_worker', {})),
  (error) => error.code === 'WORKER_CODE_EVIDENCE_INCOMPLETE');

assert.throws(() => build({ ...fixture(), proposal: { ...fixture().proposal, changedFileHashes: [] } }),
  (error) => error.code === 'WORKER_CODE_EVIDENCE_INCOMPLETE');
assert.throws(() => build(fixture('failed')),
  (error) => error.code === 'WORKER_CODE_EVIDENCE_INCOMPLETE');
process.stdout.write('Typed code worker evidence is derived from changed files, contracts, and executed tests.\n');
