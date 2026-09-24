'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Experiment before promoting shared state.', {
    schema: { fields: { proposal: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL' } } }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'spec-base', actorId: 'coordinator', kind: { type: 'set_field', key: 'proposal', value: 'baseline' }
  });
  await syncytium.createSpeculativeBranch(session.sessionId, { branchId: 'proposal-a' });
  const experiment = await syncytium.applySpeculativeOperation(session.sessionId, {
    branchId: 'proposal-a',
    operation: { opId: 'spec-change', actorId: 'researcher', kind: { type: 'set_field', key: 'proposal', value: 'candidate' } }
  });
  assert.equal(experiment.snapshot.sharedFields.proposal, 'candidate');
  const duplicate = await syncytium.applySpeculativeOperation(session.sessionId, {
    branchId: 'proposal-a',
    operation: { opId: 'spec-change', actorId: 'researcher', kind: { type: 'set_field', key: 'proposal', value: 'other' } }
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.sharedFields.proposal, 'baseline');
  assert.deepEqual((await syncytium.compareSpeculativeBranch(session.sessionId, { branchId: 'proposal-a' })).changedFields, ['proposal']);

  const promoted = await syncytium.promoteSpeculativeBranch(session.sessionId, { branchId: 'proposal-a' });
  assert.equal(promoted.status, 'PROMOTED');
  assert.equal(promoted.snapshot.sharedFields.proposal, 'candidate');
  await assert.rejects(syncytium.applySpeculativeOperation(session.sessionId, {
    branchId: 'proposal-a', operation: { opId: 'spec-late', actorId: 'researcher', kind: { type: 'set_field', key: 'proposal', value: 'late' } }
  }), (error) => error.code === 'SYNCYTIUM_BRANCH_CLOSED');

  const decision = syncytium.chooseRepairCandidates([
    { repairId: 'wide', blastRadius: 4, invariantsRestored: 1, cost: 1, informationLoss: 0 },
    { repairId: 'narrow', blastRadius: 1, invariantsRestored: 1, cost: 2, informationLoss: 0 }
  ]);
  assert.equal(decision.winner.repairId, 'narrow');
  assert.equal(decision.requiresTrinity, false);
  const ambiguous = syncytium.chooseRepairCandidates([
    { repairId: 'candidate-a', blastRadius: 1, invariantsRestored: 1, cost: 1, informationLoss: 0 },
    { repairId: 'candidate-b', blastRadius: 1, invariantsRestored: 1, cost: 1, informationLoss: 0 }
  ]);
  assert.equal(ambiguous.route, 'TRINITY');
}

main().then(() => console.log('Syncytium semantic repair and speculation checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
