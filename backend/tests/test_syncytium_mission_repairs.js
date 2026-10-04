'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const { createRealtimeControlVariantService } = require('../src/services/syncytium/variants/realtime/realtimeControlVariantService');

async function localFirstClock() {
  const session = await syncytium.createLocalFirstSession('Track clocks across devices.');
  await syncytium.recordHybridClock({ sid: session.sessionId, dev: 'device-a', ts: 100, o: { actorId: 'device-a' } });
  await syncytium.recordHybridClock({ sid: session.sessionId, dev: 'device-b', ts: 110, o: { actorId: 'device-b' } });
  const before = await syncytium.localFirstSnapshot({ sid: session.sessionId, o: {} });
  assert.equal(before.devicesList.length, 2);
  await syncytium.syncPeer({ sid: session.sessionId, src: 'device-a', dst: 'device-b', vc: { 'device-a': 2 }, o: {} });
  assert.equal((await syncytium.listReplicas({ sid: session.sessionId, o: {} })).activeDevices, 1);
}

async function speculativeEligibility() {
  const session = await syncytium.createSpeculativeSession('Reject exhausted and failed branches.');
  const common = { sid: session.sessionId, baseSnapshotId: 'S0', o: {} };
  await syncytium.spawnBranch({ ...common, branchId: 'zero-budget', o: { branchConfig: { executionBudgetMs: 0 } } });
  const exhausted = await syncytium.executeOnBranch({ ...common, branchId: 'zero-budget', operations: [{ opId: 'must-not-run' }] });
  assert.equal(exhausted.status, 'BUDGET_EXCEEDED');
  await syncytium.spawnBranch({ ...common, branchId: 'failed-validation' });
  await assert.rejects(() => syncytium.promoteBranch({ ...common, branchId: 'failed-validation',
    evidenceGate: { passed: false, checks: [{ name: 'build', passed: false }] }
  }), (error) => error.code === 'SPEC_PROMOTION_GATED');
  await assert.rejects(() => syncytium.promoteBranch({ ...common, branchId: 'failed-validation',
    evidenceGate: { passed: true, checks: [{ name: 'build', passed: true }] }
  }), (error) => error.code === 'SPEC_PROMOTION_INELIGIBLE');
}

async function epistemicAsOf() {
  const session = await syncytium.createEpistemicSession('Project evidence by recording time.');
  await syncytium.addEpistemicClaim(session.sessionId, { claimId: 'claim', statement: 'Claim',
    claimType: 'factual', confidence: 0.7, actorId: 'author' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const asOf = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await syncytium.updateEpistemicConfidence(session.sessionId, { claimId: 'claim', updateId: 'later',
    confidence: 0.9, actorId: 'reviewer', sourceId: 'independent-source' });
  const past = await syncytium.epistemicSnapshot(session.sessionId, { at: asOf });
  const current = await syncytium.epistemicSnapshot(session.sessionId);
  assert.equal(past.epistemic.confidenceByClaim.claim, 0.7);
  assert.equal(current.epistemic.confidenceByClaim.claim, 0.9);
}

async function documentUndoAttribution() {
  const session = await syncytium.createDocumentSession('Preserve authorship and typed citations.');
  await syncytium.insertDocumentBlock(session.sessionId, { actorId: 'author', blockId: 'citation-block',
    sectionId: 'sources', blockType: 'citation', text: 'Reference', schemaVersion: 1,
    citation: { sourceId: 'source-1' } });
  await syncytium.deleteDocumentBlock(session.sessionId, {
    actorId: 'editor', blockId: 'citation-block', schemaVersion: 1
  });
  const deletion = (await syncytium.inspectHistory(session.sessionId)).operations.find((operation) =>
    operation.kind?.key === 'sections' && operation.kind.action === 'delete' && operation.kind.elementId === 'citation-block');
  await syncytium.undoDocumentOperation(session.sessionId, { actorId: 'reviewer',
    operationId: deletion.opId, undoId: 'restore-citation', schemaVersion: 1 });
  const restored = (await syncytium.documentSnapshot(session.sessionId)).shared.sharedFields.sections[0];
  assert.equal(restored.attribution.actorId, 'author');
  assert.equal(restored.restoredBy.actorId, 'reviewer');
  assert.equal(restored.blockType, 'citation');
}

async function softCompaction() {
  const session = await syncytium.createSoftSession('Persist compacted deltas and retain pending deltas.');
  await syncytium.applyDelta({ sessionId: session.sessionId, delta: { type: 'increment', deltaId: 'acked', value: 1 }, options: { actorId: 'a' } });
  await syncytium.reconcileAntiEntropy({ sessionId: session.sessionId, options: {} });
  await syncytium.applyDelta({ sessionId: session.sessionId, delta: { type: 'set', deltaId: 'pending', value: 2 }, options: { actorId: 'b' } });
  const compacted = await syncytium.compressState({ sessionId: session.sessionId, options: {} });
  assert.deepEqual(compacted.preservedDeltaIds, ['pending']);
  const snapshot = await syncytium.softSnapshot({ sessionId: session.sessionId, options: {} });
  assert.equal(snapshot.metrics.compactedDeltas, 1);
  assert.equal(snapshot.metrics.preservedDeltas, 1);
}

async function realtimeFailsafeRetry() {
  const applyTransaction = syncytium.applyTransaction;
  let attempts = 0;
  const runtime = createRealtimeControlVariantService({ ...syncytium, applyTransaction: async (...args) => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('injected concurrent state version change'), {
      code: 'SYNCYTIUM_PRECONDITION_FAILED'
    });
    return applyTransaction(...args);
  } });
  const session = await runtime.createRealtimeControlSession('Retry safe output after a version conflict.');
  const result = await runtime.executeControlCycle(session.sessionId, {
      actorId: 'controller', taskId: 'motor', wcetEvidenceId: 'missing-evidence',
      deadlineAtMs: Date.now() + 1000, operations: [{ opId: 'unsafe-op', actorId: 'controller',
        kind: { type: 'typed_field', key: 'controls', action: 'set', value: 'RUN' } }],
      safeOutput: { motor: 'STOP' }, failSafeTxId: 'retry-safe-tx', failSafeOpId: 'retry-safe-op'
    });
  assert.equal(attempts, 2);
  assert.equal(result.control.retries, 1);
  assert.deepEqual((await syncytium.snapshot(session.sessionId)).shared.sharedFields.safety_outputs.motor.output,
    { motor: 'STOP' });
}

async function run() {
  await localFirstClock();
  await speculativeEligibility();
  await epistemicAsOf();
  await documentUndoAttribution();
  await softCompaction();
  await realtimeFailsafeRetry();
  console.log('Syncytium mission repair regressions: PASS (6 scenarios)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
