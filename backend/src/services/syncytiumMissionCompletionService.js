'use strict';

const completionContract = require('./missionCompletionContract');
const completionEvidence = require('./missionCompletionEvidenceService');

function memberId(member) {
  return member?.memberId || member?.workerId || null;
}

function semanticReasons(validation, expectedCount, output) {
  const reasons = [];
  if (!validation) reasons.push('SEMANTIC_VALIDATION_MISSING');
  else {
    if (validation.status !== 'complete') reasons.push(`SEMANTIC_${String(validation.status).toUpperCase()}`);
    if (validation.workerCount !== expectedCount) reasons.push('SEMANTIC_WORKER_COUNT_MISMATCH');
    if (validation.coveredWorkers !== expectedCount) reasons.push('SEMANTIC_WORKER_COVERAGE_INCOMPLETE');
  }
  if (output.members.length !== expectedCount) reasons.push('WORKER_RESULT_COUNT_MISMATCH');
  if (output.members.some((member) => member.status !== 'completed')) reasons.push('WORKER_NOT_COMPLETED');
  if ((output.dispatchFailures || []).length) reasons.push('WORKER_DISPATCH_FAILED');
  return reasons;
}

function stateReasons(output) {
  const validation = output.stateValidation;
  const reasons = [];
  if (output.materialization?.status !== 'verified') reasons.push('MATERIALIZATION_NOT_VERIFIED');
  if (validation?.status !== 'verified') {
    reasons.push(...(validation?.reasons || ['SHARED_STATE_VALIDATION_MISSING']));
  }
  return [...new Set(reasons)];
}

function failedValidation(validation, reasons) {
  return validation?.status === 'conflicts_detected'
    || reasons.includes('FAILED_SHARED_INVARIANTS');
}

function syncytiumValidation(output, validation, expectedCount) {
  const reasons = [...semanticReasons(validation, expectedCount, output), ...stateReasons(output)];
  if (failedValidation(validation, reasons)) return { status: 'failed', reasons: [...new Set(reasons)] };
  return { status: reasons.length ? 'partial' : 'verified', reasons: [...new Set(reasons)] };
}

function applySemanticValidation(output, validation, expectedCount) {
  output.semanticValidation = validation || null;
  output.topologyValidation = syncytiumValidation(output, validation, expectedCount);
  output.syncytiumReady = output.topologyValidation.status === 'verified';
  return output;
}

async function validateAndComplete(context) {
  context.output.materialization = await materializeCompletedMission(context);
  context.output.stateValidation = await validateSession(context.sessionId, { db: context.db });
  applySemanticValidation(context.output, context.validation, context.expectedCount);
  const evidence = await completionEvidence.collect({ db: context.db, missionId: context.missionId,
    members: context.output.members, evidenceProofs: context.evidenceProofs });
  const result = completionContract.evaluate(contractInput(context, evidence));
  return applyCompletionResult(context.output, result);
}

function contractInput(context, evidence) {
  const requiredMemberIds = evidence.members.map(memberId).filter(Boolean);
  return { missionId: context.missionId || null, topology: 'syncytium', lifecycleState: 'completed',
    requiredMemberIds, members: evidence.members, evidenceProofs: evidence.evidenceProofs,
    topologyValidation: context.output.topologyValidation,
    barrierStatus: context.validation?.status === 'complete' ? 'complete' : 'partial' };
}

function applyCompletionResult(output, result) {
  output.completionContract = result;
  output.complete = result.verdict === 'succeeded';
  output.success = result.success;
  output.status = output.complete ? 'completed' : result.verdict === 'failed' ? 'failed' : 'partial';
  return output;
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
  if (validation?.status !== 'complete') return false;
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
