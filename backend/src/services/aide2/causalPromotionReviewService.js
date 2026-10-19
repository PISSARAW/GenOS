'use strict';

const { createHash } = require('node:crypto');
const { validateReceipt } = require('../epistemicVerifierReceiptService');
const { listVerifierDigests } = require('../verifierTrustRegistry');
const { confidenceInterval } = require('./generationEvaluationService');

const OBLIGATIONS = Object.freeze([
  'agent_competence', 'ood_transfer', 'reward_hacking_absent', 'project_longitudinal_benefit'
]);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validProjectWindow(plan, candidateId, window) {
  const scoped = window.responsibilityId === plan.responsibilityId && window.candidateId === candidateId;
  return scoped && Number.isFinite(window.baselineOutcome) && Number.isFinite(window.candidateOutcome);
}

function projectWindowErrors(plan, evaluation, windows) {
  if (!Array.isArray(windows) || windows.length < 3) return ['project-windows-insufficient'];
  const ids = windows.map((window) => window.observationId);
  const contexts = new Set(windows.map((window) => window.contextHash));
  const finalId = evaluation.finalEvaluation?.candidateId;
  const scoped = windows.every((window) => validProjectWindow(plan, finalId, window));
  const errors = [];
  if (new Set(ids).size !== ids.length || ids.some((id) => !id)) errors.push('project-window-identities-invalid');
  if (contexts.size < 2 || [...contexts].some((value) => !value)) errors.push('project-context-diversity-required');
  if (!scoped) errors.push('project-window-scope-invalid');
  return errors;
}

function projectProof(plan, windows) {
  const gains = windows.map((window) => window.candidateOutcome - window.baselineOutcome);
  const interval = confidenceInterval(gains);
  return { supported: interval.lower !== null && interval.lower >= plan.thresholds.projectGain,
    threshold: plan.thresholds.projectGain, windows: windows.length,
    contexts: new Set(windows.map((window) => window.contextHash)).size, ...interval };
}

function buildCausalReview(plan, input) {
  const evaluation = input?.campaignEvaluation;
  if (evaluation?.campaignId !== plan.campaignId) throw new Error('AIDE2_CAMPAIGN_EVIDENCE_MISMATCH');
  const errors = projectWindowErrors(plan, evaluation, input?.projectWindows);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'AIDE2_PROJECT_EVIDENCE_INVALID', errors });
  const final = evaluation.finalEvaluation;
  const competence = final.status === 'qualified_measurement' && final.competenceProof.supported;
  const oodTransfer = final.oodTransferProof.supported;
  const noRewardHacking = !evaluation.rewardHackingDetected;
  const longitudinalProjectBenefit = projectProof(plan, input.projectWindows);
  const supported = competence && oodTransfer && noRewardHacking && longitudinalProjectBenefit.supported;
  const evidence = {
    campaignId: plan.campaignId, responsibilityId: plan.responsibilityId,
    motivationEvidenceId: plan.motivationEvidenceId, candidateId: final.candidateId,
    competence, oodTransfer, noRewardHacking, longitudinalProjectBenefit,
    generationCount: evaluation.evaluations.length
  };
  return { schema: 'genos.aide2.causal-review/v1', ...evidence, reviewDigest: digest(evidence),
    status: supported ? 'awaiting_independent_verification' : 'causal_evidence_rejected',
    promotionAllowed: false, promotionExecuted: false };
}

function verificationErrors(plan, review, verification) {
  const receipt = verification?.receipt;
  const covered = new Set(receipt?.coveredObligations || []);
  const errors = [];
  if (review.status !== 'awaiting_independent_verification') errors.push('causal-review-not-supported');
  if (verification?.actorId !== plan.actors.verifierId) errors.push('verifier-identity-mismatch');
  if (verification?.reviewDigest !== review.reviewDigest) errors.push('verifier-review-digest-mismatch');
  if (!validateReceipt(receipt, listVerifierDigests())) errors.push('verifier-receipt-invalid');
  if (receipt?.resultId !== plan.campaignId || receipt?.independent !== true || receipt?.status !== 'verified') {
    errors.push('verifier-receipt-scope-invalid');
  }
  if (OBLIGATIONS.some((obligation) => !covered.has(obligation))) errors.push('verifier-obligations-incomplete');
  return errors;
}

function authorizationErrors(plan, review, authorization) {
  const errors = [];
  if (authorization?.authorizerId !== plan.actors.authorizerId) errors.push('authorizer-identity-mismatch');
  if (authorization?.reviewDigest !== review.reviewDigest) errors.push('authorization-review-digest-mismatch');
  if (authorization?.decision !== 'approve_promotion_review') errors.push('authorization-decision-invalid');
  if (!authorization?.authorizationId || Number.isNaN(Date.parse(authorization?.authorizedAt))) {
    errors.push('authorization-receipt-invalid');
  }
  return errors;
}

function authorizePromotionReview(plan, input) {
  const review = input?.review;
  const errors = [
    ...verificationErrors(plan, review, input?.verification),
    ...authorizationErrors(plan, review, input?.authorization)
  ];
  if (errors.length) return { status: 'promotion_review_rejected', errors,
    promotionAllowed: false, promotionExecuted: false };
  return {
    schema: 'genos.aide2.promotion-review/v1', campaignId: plan.campaignId,
    candidateId: review.candidateId, responsibilityId: plan.responsibilityId,
    reviewDigest: review.reviewDigest, verificationReceipt: input.verification.receipt,
    authorizationId: input.authorization.authorizationId,
    status: 'eligible_for_external_promotion_request',
    promotionAllowed: false, promotionExecuted: false
  };
}

module.exports = { OBLIGATIONS, authorizePromotionReview, buildCausalReview, digest, projectProof };
