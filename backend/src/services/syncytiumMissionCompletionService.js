'use strict';

function applySemanticValidation(output, validation, expectedCount) {
  output.semanticValidation = validation;
  output.complete = validation.status === 'complete'
    && validation.workerCount === expectedCount && validation.coveredWorkers === expectedCount
    && output.members.length === expectedCount
    && output.members.every((member) => member.status === 'completed')
    && !(output.dispatchFailures || []).length && output.stateValidation?.status === 'verified';
  if (!output.complete) output.semanticValidation.status = 'incomplete';
  output.status = output.complete ? 'completed' : 'partial';
  return output;
}

async function validateAndComplete(context) {
  if (!context.validation) return context.output;
  context.output.materialization = await materializeCompletedMission(context);
  context.output.stateValidation = await validateSession(context.sessionId, { db: context.db });
  return applySemanticValidation(context.output, context.validation, context.expectedCount);
}

async function materializeCompletedMission(context) {
  if (!workersReadyForMaterialization(context)) {
    return { status: 'skipped', reason: 'WORKER_EVIDENCE_INCOMPLETE' };
  }
  const existing = await validateSession(context.sessionId, { db: context.db });
  if (existing.status === 'verified') {
    return { status: 'verified', snapshotId: existing.snapshotId, reused: true };
  }
  try {
    const receipt = await require('./syncytium/materializationGateService')
      .materialize(context.db, context.sessionId);
    return receipt.materialization;
  } catch (error) {
    return { status: 'refused', reason: error.reason || error.code || 'MATERIALIZATION_FAILED' };
  }
}

function workersReadyForMaterialization(context) {
  const { validation, expectedCount, output } = context;
  if (!context.db || validation.status !== 'complete') return false;
  if (validation.workerCount !== expectedCount || validation.coveredWorkers !== expectedCount) return false;
  if (output.members.length !== expectedCount || (output.dispatchFailures || []).length) return false;
  return output.members.every((member) => member.status === 'completed');
}

async function validateSession(sessionId, options = {}) {
  const syncytium = require('./syncytiumCoordinationService');
  try {
    const state = await syncytium.snapshot(sessionId, options);
    const snapshots = await syncytium.listSnapshots(sessionId, options);
    const replicas = await syncytium.inspectReplicas(sessionId, options);
    const latest = snapshots.findLast((snapshot) => snapshot.stateVersion === state.shared.totalOps);
    const checks = [
      [state.shared.totalOps > 0, 'EMPTY_SHARED_STATE'],
      [state.consistency.verdict === 'consistent', 'FAILED_SHARED_INVARIANTS'],
      [Boolean(latest), 'MATERIALIZATION_MISSING_OR_STALE'],
      [replicas.every((replica) => replica.offlineOperationCount === 0), 'OFFLINE_OPERATIONS_PENDING']
    ];
    const reasons = checks.filter(([passed]) => !passed).map(([, reason]) => reason);
    return { status: reasons.length ? 'incomplete' : 'verified', reasons, sessionId,
      verificationScope: 'committed_shared_state', stateVersion: state.shared.totalOps,
      snapshotId: latest?.snapshotId || null, causalFrontier: state.shared.causalFrontier,
      invariants: state.consistency.invariantReceipts, failedInvariants: state.consistency.failedInvariants };
  } catch (error) {
    return { status: 'incomplete', sessionId, reasons: ['SESSION_EVIDENCE_UNAVAILABLE'], errorCode: error.code || null };
  }
}

module.exports = { applySemanticValidation, validateAndComplete, validateSession };
