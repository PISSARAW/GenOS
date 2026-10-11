'use strict';

const syncytium = require('../syncytiumCoordinationService');
const persistence = require('../syncytiumPersistenceService');
const completion = require('../syncytiumMissionCompletionService');

function refusal(reason) {
  return Object.assign(new Error(`Syncytium materialization refused: ${reason}.`), {
    code: 'SYNCYTIUM_MATERIALIZATION_REFUSED', reason
  });
}

function sameFrontier(left, right) {
  const actors = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...actors].every((actor) => left?.[actor] === right?.[actor]);
}

function assertReplicas(replicas, state) {
  for (const replica of Object.values(replicas || {})) {
    if (!Array.isArray(replica.offlineOperations) || replica.offlineOperations.length) {
      throw refusal('REPLICA_NOT_RECONCILED');
    }
    if (replica.status === 'RETIRED') continue;
    if (replica.status !== 'ACTIVE' || replica.lastSeenVersion !== state.totalOps
      || !sameFrontier(replica.causalFrontier, state.causalFrontier)) {
      throw refusal('REPLICA_NOT_RECONCILED');
    }
  }
}

async function inspectBoundary(db, sessionId) {
  const current = await syncytium.snapshot(sessionId, { db });
  if (current.shared.totalOps < 1) throw refusal('EMPTY_SHARED_STATE');
  if (current.consistency.verdict !== 'consistent') throw refusal('FAILED_SHARED_INVARIANTS');
  const persisted = await persistence.loadSession(db, sessionId);
  if (!persisted) throw refusal('SESSION_EVIDENCE_UNAVAILABLE');
  assertReplicas(persisted.state.replicas, current.shared);
  return current.shared;
}

async function materialize(db, sessionId) {
  const before = await inspectBoundary(db, sessionId);
  const stored = await syncytium.createSnapshot(sessionId, { db });
  const after = await inspectBoundary(db, sessionId);
  if (stored.stateVersion !== after.totalOps || before.totalOps !== after.totalOps
    || !sameFrontier(before.causalFrontier, after.causalFrontier)) {
    throw refusal('STATE_CHANGED_DURING_MATERIALIZATION');
  }
  const validation = await completion.validateSession(sessionId, { db });
  if (validation.status !== 'verified' || validation.snapshotId !== stored.snapshotId) {
    throw refusal('MATERIALIZED_EVIDENCE_UNVERIFIED');
  }
  const finalState = await inspectBoundary(db, sessionId);
  if (finalState.totalOps !== stored.stateVersion
    || !sameFrontier(finalState.causalFrontier, stored.causalFrontier)) {
    throw refusal('STATE_CHANGED_AFTER_VALIDATION');
  }
  return { sessionId, materialization: { status: 'verified', snapshotId: stored.snapshotId,
    stateVersion: stored.stateVersion, causalFrontier: stored.causalFrontier,
    verificationScope: validation.verificationScope,
    invariantReceipts: validation.invariants } };
}

module.exports = { materialize };
