'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSpeculativeSession('Compare isolated candidate branches.');
  const common = { sid: session.sessionId, baseSnapshotId: 'S0', o: { actorId: 'researcher' } };
  await syncytium.spawnBranch({ ...common, branchId: 'B1' });
  await syncytium.spawnBranch({ ...common, branchId: 'B2' });

  const operation = (value, opId) => ({
    opId, actorId: 'researcher', kind: { type: 'typed_field', key: 'branchSnapshots', action: 'set',
      entryKey: `candidate-${opId}`, value }
  });
  await syncytium.executeOnBranch({ ...common, branchId: 'B1', operations: [
    operation({ result: 'B1' }, 'branch-b1-op')
  ] });
  await syncytium.executeOnBranch({ ...common, branchId: 'B2', operations: [
    operation({ result: 'B2' }, 'branch-b2-op')
  ] });

  const mainBeforePromotion = await syncytium.snapshot(session.sessionId);
  assert.equal(mainBeforePromotion.shared.sharedFields.branchSnapshots['candidate-branch-b1-op'], undefined);
  const comparison = await syncytium.compareBranches({ ...common, branchIds: ['B1', 'B2'],
    metricName: 'score', metrics: { B1: 9, B2: 4 } });
  assert.equal(comparison.ranked[0].branchId, 'B1');
  assert.equal(comparison.branches.find((branch) => branch.branchId === 'B1').snapshot.sharedFields
    .branchSnapshots['candidate-branch-b1-op'].result, 'B1');

  await assert.rejects(() => syncytium.promoteBranch({ ...common, branchId: 'B2',
    evidenceGate: { passed: false, checks: [{ passed: false }] } }),
  (error) => error.code === 'SPEC_PROMOTION_GATED');
  const promoted = await syncytium.promoteBranch({ ...common, branchId: 'B1', evidenceGate: {
    passed: true, checks: [{ name: 'validation', passed: true }]
  } });
  assert.equal(promoted.newStatus, 'PROMOTED');
  const { operations: promotedHistory } = await syncytium.inspectHistory(session.sessionId);
  const dots = promotedHistory.map(item => JSON.stringify(item.dot));
  assert.equal(new Set(dots).size, dots.length);
  const mainAfterPromotion = await syncytium.snapshot(session.sessionId);
  assert.equal(mainAfterPromotion.shared.sharedFields.branchSnapshots['candidate-branch-b1-op'].result, 'B1');
  assert.equal(mainAfterPromotion.shared.sharedFields.branchSnapshots['candidate-branch-b2-op'], undefined);

  console.log('Syncytium speculative isolation and promotion checks: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
