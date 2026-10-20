'use strict';

const assert = require('node:assert/strict');
const completion = require('../src/services/biologicalMissionCompletionService');
const { digest } = require('../src/services/evidenceContractService');
const { handleBiologicalCondition } = require('../src/services/topology/biologicalConditions.cjs');

function output(statuses, status = 'completed') {
  return { status, members: statuses.map((memberStatus, index) => ({
    workerId: `worker-${index + 1}`, status: memberStatus
  })), dispatchFailures: [] };
}

function proof(missionId, workerId) {
  const content = { missionId, workerId, result: { status: 'completed', verified: true } };
  return { reference: digest(content), content };
}

async function verifyWorkerCompletionWithoutDecisionProof() {
  const result = await completion.complete({ mode: 'trinity', missionId: 'mission-1',
    output: output(['completed', 'completed']), expectedCount: 2 });
  assert.equal(result.complete, false);
  assert.equal(result.status, 'partial');
  assert.equal(result.semanticValidation, undefined);
  assert.equal(result.completionContract.verdict, 'partial');
  assert.equal(result.success, false);
  assert.equal(handleBiologicalCondition('trinity', { biologicalMode: result }), true);
}

async function verifyCompletionContractIntegration() {
  const evidenceProofs = [proof('mission-2', 'worker-1')];
  const result = await completion.complete({ mode: 'biocenose', missionId: 'mission-2',
    output: output(['completed']), expectedCount: 1, evidenceProofs });
  assert.equal(result.complete, true);
  assert.equal(result.completionContract.schema, 'genos.mission-completion/v1');
  assert.equal(result.completionContract.verdict, 'succeeded');
  assert.equal(result.success, true);
}

async function verifyPartialBarrierFails() {
  const result = await completion.complete({ mode: 'rhizome', missionId: 'mission-3',
    output: output(['completed', 'error'], 'partial'), expectedCount: 2 });
  assert.equal(result.complete, false);
  assert.equal(result.status, 'failed');
  assert.equal(handleBiologicalCondition('rhizome', { biologicalMode: result }), true);
}

async function verifyRhizomeUsesCollectedBranches() {
  const evidenceProofs = [proof('mission-4', 'worker-1'), proof('mission-4', 'worker-2')];
  const result = await completion.complete({ mode: 'rhizome', missionId: 'mission-4',
    output: { status: 'completed', complete: true, dispatchFailures: [],
      members: [{ workerId: 'worker-1', status: 'completed' },
        { workerId: 'worker-2', status: 'started' }],
      branches: [{ workerId: 'worker-1', status: 'completed' },
        { workerId: 'worker-2', status: 'completed' }] },
    expectedCount: 1, evidenceProofs });
  assert.equal(result.complete, true);
  assert.equal(result.status, 'completed');
  assert.equal(handleBiologicalCondition('rhizome', { biologicalMode: result }), false);
}

async function main() {
  await verifyWorkerCompletionWithoutDecisionProof();
  await verifyCompletionContractIntegration();
  await verifyPartialBarrierFails();
  await verifyRhizomeUsesCollectedBranches();
  console.log('Biological mission completion: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
