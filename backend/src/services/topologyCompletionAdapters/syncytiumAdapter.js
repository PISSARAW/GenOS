'use strict';

const { baseDossier } = require('./dossier');
const stateReader = require('./syncytiumStateReader');
const { digest } = require('../evidenceContractService');

function incomplete(base, reason) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'partial', reasons: [reason] }, invariants: [], oracle: null };
}

function failed(base, reason, state = {}) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'failed', reasons: [reason] }, invariants: [{ id: reason, passed: false,
    sessionId: state.sessionId || null }], oracle: null };
}

function semanticValidationReasons(validation, expectedCount) {
  const reasons = [];
  if (!validation) {
    reasons.push('SEMANTIC_VALIDATION_MISSING');
    return reasons;
  }
  if (validation.status !== 'complete') {
    reasons.push(`SEMANTIC_${String(validation.status).toUpperCase()}`);
  }
  if (validation.workerCount !== expectedCount) {
    reasons.push('SYNCYTIUM_WORKER_COUNT_MISMATCH');
  }
  if (validation.coveredWorkers !== expectedCount) {
    reasons.push('SYNCYTIUM_WORKER_COVERAGE_INCOMPLETE');
  }
  return reasons;
}

function workerCompletionReasons(output, expectedCount) {
  const reasons = [];
  if (output.members.length !== expectedCount) {
    reasons.push('WORKER_RESULT_COUNT_MISMATCH');
  }
  if (output.members.some((member) => member.status !== 'completed')) {
    reasons.push('WORKER_NOT_COMPLETED');
  }
  if ((output.dispatchFailures || []).length) {
    reasons.push('WORKER_DISPATCH_FAILED');
  }
  return reasons;
}

function isHardSemanticReason(reason) {
  return reason.includes('FAILED') || reason.includes('NOT_COMPLETED')
    || reason.includes('DISPATCH_FAILED');
}

function assessment(reasons, hardReason) {
  if (!reasons.length) return { status: 'verified', reasons: [] };
  return { status: reasons.some(hardReason) ? 'failed' : 'partial',
    reasons: [...new Set(reasons)] };
}

function semanticAssessment(output, validation, expectedCount) {
  const reasons = [...semanticValidationReasons(validation, expectedCount),
    ...workerCompletionReasons(output, expectedCount)];
  return assessment(reasons, isHardSemanticReason);
}

function stateAssessment(output) {
  const reasons = [];
  const validation = output.stateValidation;
  if (output.materialization?.status !== 'verified') {
    reasons.push('MATERIALIZATION_NOT_VERIFIED');
  }
  if (validation?.status !== 'verified') {
    reasons.push(...(validation?.reasons || ['SHARED_STATE_VALIDATION_MISSING']));
  }
  return assessment(reasons, (reason) => reason === 'FAILED_SHARED_INVARIANTS');
}

function oracleReceipt(base, state) {
  return {
    schema: 'genos.syncytium-completion-oracle/v1',
    missionId: base.missionId,
    sessionId: state.sessionId,
    sharedTotalOps: state.shared.totalOps,
    causalFrontier: state.causalFrontier,
    consistencyVerdict: state.consistency.verdict,
    snapshotId: state.latest?.snapshotId || null,
    consistencyHash: digest(state.consistency),
    sharedStateHash: digest(state.shared)
  };
}

function verifiedDossier(base, state) {
  const refs = (base.roster.evidenceProofs || []).map((proof) => proof.reference).filter(Boolean);
  const receipt = oracleReceipt(base, state);
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    topologyValidation: { status: 'verified', reasons: [] }, barrierStatus: 'complete',
    invariants: [
      { id: 'syncytium_shared_state_consistency', passed: true,
        stateVersion: state.shared.totalOps },
      { id: 'syncytium_materialization_verified', passed: true },
      { id: 'syncytium_replica_coherence', passed: true },
      { id: 'syncytium_invariant_receipts', passed: true }
    ],
    oracle: { status: 'verified', independent: true,
      verifierIds: ['syncytium-coordination-service'],
      evidenceRefs: refs, receipt, receiptHash: digest(receipt) } };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context, evidence: input.evidence });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  const output = input.context?.output || {};
  const expectedCount = input.context?.expectedCount || (output.members || []).length;
  const semantic = semanticAssessment(output, output.semanticValidation, expectedCount);
  const stateCheck = stateAssessment(output);
  const issue = [semantic, stateCheck].find((check) => check.status !== 'verified');
  if (issue?.status === 'failed') return failed(base, issue.reasons[0], state);
  if (issue) return incomplete(base, issue.reasons[0]);
  return verifiedDossier(base, state);
}

module.exports = Object.freeze({ id: 'syncytium-completion-v1', topology: 'syncytium',
  specialized: true, build });
