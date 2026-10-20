'use strict';

const { baseDossier } = require('./dossier');
const stateReader = require('./biocenoseStateReader');
const receiptProof = require('../biocenose/verification/hybridOracleReceiptProof');
const verifierRouter = require('../biocenose/verification/verifierRouter');
const { digest } = require('../evidenceContractService');

function incomplete(base, reason) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'partial', reasons: [reason] }, invariants: [], oracle: null };
}

function failed(base, reason, state) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'failed', reasons: [reason] }, invariants: [{ id: reason, passed: false,
    communityId: state?.session?.communityId || state?.communityId || null }], oracle: null };
}

function stepResult(state, step) {
  return state.receipts.find((item) => item.step === step)?.result || null;
}

function quorumAssessment(state) {
  const aggregation = stepResult(state, 'aggregate_by_question_type');
  if (!aggregation) return { status: 'partial', reason: 'biocenose_aggregation_missing' };
  if (aggregation.quorum?.reached !== true) {
    return { status: 'failed', reason: 'biocenose_quorum_not_reached' };
  }
  const dissent = stepResult(state, 'check_dissent');
  if (!dissent) return { status: 'partial', reason: 'biocenose_dissent_assessment_missing' };
  const recorded = new Set(state.dissent.map((item) => item.dissentId));
  const assessed = new Set((dissent.entries || []).map((item) => item.dissentId));
  if (recorded.size !== assessed.size || [...recorded].some((id) => !assessed.has(id))) {
    return { status: 'failed', reason: 'biocenose_dissent_journal_mismatch' };
  }
  const blocked = (dissent.gates || []).some((gate) => gate.promotion !== 'ALLOWED');
  return blocked ? { status: 'failed', reason: 'biocenose_objection_unresolved' }
    : { status: 'verified', aggregation, dissent };
}

function stoppingAssessment(state) {
  const stopReason = state.judgment.judgment.stopReason;
  const accepted = new Set(['STABILITY', 'ROUND_LIMIT', 'LOW_EVIDENCE_VALUE']);
  return accepted.has(stopReason) ? { status: 'verified', stopReason }
    : { status: 'failed', reason: 'biocenose_stopping_rule_invalid' };
}

function receiptContext(state) {
  const result = stepResult(state, 'review_and_verify') || {};
  return Array.isArray(result.verificationReceipts) ? result.verificationReceipts : [];
}

function verifierFor(state, receipt) {
  return state.session.members.find((member) => member.memberId === receipt?.verifierId);
}

function claimFor(state, receipt) {
  return state.claims.find((claim) => claim.claimId === receipt?.claimId);
}

function validVerifier(claim, verifier) {
  if (!claim || !verifier || verifier.status !== 'ACTIVE') return false;
  return verifierRouter.route({ claim: { ...claim.claim, claimId: claim.claimId },
    members: [verifier] }).deterministicAvailable;
}

function assessReceipt(state, receipt) {
  const claim = claimFor(state, receipt);
  const verifier = verifierFor(state, receipt);
  if (!validVerifier(claim, verifier)) return { status: 'failed' };
  if (!receiptProof.verify({ claim, receipt, session: state.session, verifier })) {
    return { status: 'failed' };
  }
  return receipt.epistemicReceipt?.independent === true
    ? { status: 'verified', claim, verifier, receipt }
    : { status: 'dependent' };
}

function oracleAssessment(state) {
  if (state.constitution.constitution.variant !== 'hybrid_oracle_community') {
    return { status: 'partial', reason: 'biocenose_independent_oracle_unavailable' };
  }
  if (!state.claims.length) return { status: 'partial', reason: 'biocenose_claims_missing' };
  const receipts = receiptContext(state);
  if (!receipts.length) return { status: 'partial', reason: 'biocenose_hybrid_oracle_receipt_missing' };
  const assessed = receipts.map((receipt) => assessReceipt(state, receipt));
  if (assessed.some((item) => item.status === 'failed')) {
    return { status: 'failed', reason: 'biocenose_hybrid_oracle_receipt_invalid' };
  }
  const verified = assessed.filter((item) => item.status === 'verified');
  const covered = new Set(verified.map((item) => item.claim.claimId));
  if (!state.claims.every((claim) => covered.has(claim.claimId))) {
    return { status: 'partial', reason: 'biocenose_hybrid_oracle_coverage_incomplete' };
  }
  return { status: 'verified', receipts: verified.map((item) => item.receipt) };
}

function oracleReceipt(base, state, receipts) {
  return { schema: 'genos.biocenose-completion-oracle/v1', missionId: base.missionId,
    communityId: state.session.communityId, judgmentId: state.judgment.row.judgment_id,
    round: state.session.round, claimIds: state.claims.map((claim) => claim.claimId),
    receiptIds: receipts.map((receipt) => receipt.receiptId),
    receiptDigests: receipts.map((receipt) => digest(receipt)) };
}

function evidenceReferences(base) {
  return (base.roster.evidenceProofs || []).map((proof) => proof.reference).filter(Boolean);
}

function verifiedDossier(base, state, assessment) {
  const refs = evidenceReferences(base);
  if (!refs.length) return incomplete(base, 'biocenose_worker_evidence_missing');
  const receipt = oracleReceipt(base, state, assessment.receipts);
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    topologyValidation: { status: 'verified', reasons: [] },
    invariants: [
      { id: 'biocenose_mission_scope', passed: true, missionId: base.missionId,
        communityId: state.session.communityId },
      { id: 'biocenose_round_journal_integrity', passed: true, revision: state.session.revision },
      { id: 'biocenose_terminal_judgment', passed: true,
        judgmentId: state.judgment.row.judgment_id },
      { id: 'biocenose_stopping_rule', passed: true,
        stopReason: state.judgment.judgment.stopReason },
      { id: 'biocenose_quorum_and_objections', passed: true },
      { id: 'biocenose_hybrid_oracle_claim_coverage', passed: true,
        claimIds: state.claims.map((claim) => claim.claimId) }
    ],
    oracle: { status: 'verified', independent: true,
      verifierIds: [...new Set(assessment.receipts.map((item) => item.verifierId))],
      evidenceRefs: refs, receipt, receiptHash: digest(receipt) } };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  const community = quorumAssessment(state);
  if (community.status === 'failed') return failed(base, community.reason, state);
  if (community.status !== 'verified') return incomplete(base, community.reason);
  const stopping = stoppingAssessment(state);
  if (stopping.status === 'failed') return failed(base, stopping.reason, state);
  const oracle = oracleAssessment(state);
  if (oracle.status === 'failed') return failed(base, oracle.reason, state);
  if (oracle.status !== 'verified') return incomplete(base, oracle.reason);
  return verifiedDossier(base, state, oracle);
}

module.exports = Object.freeze({ id: 'biocenose-completion-v1', topology: 'biocenose',
  specialized: true, build });
