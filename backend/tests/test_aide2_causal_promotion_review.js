'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID = 'aide2-test';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'aide2-isolated-test-secret';
const { createCampaignPlan } = require('../src/services/aide2/campaignContract');
const { evaluateCampaign } = require('../src/services/aide2/generationEvaluationService');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const { getVerifier } = require('../src/services/verifierTrustRegistry');
const { OBLIGATIONS, authorizePromotionReview, buildCausalReview } = require('../src/services/aide2/causalPromotionReviewService');

function fixturePlan() {
  return createCampaignPlan({ campaignId: 'campaign-aide2', responsibilityId: 'delivery-api',
    motivationEvidenceId: 'shev-gap-1', generationCount: 3,
    actors: { producerId: 'builder', evaluatorId: 'eval', verifierId: 'verify', authorizerId: 'authorize' },
    datasets: { evolution: { hash: 'a'.repeat(64), caseIds: ['e-1', 'e-2'] },
      holdout: { hash: 'b'.repeat(64), caseIds: ['h-1', 'h-2'] },
      ood: { hash: 'c'.repeat(64), caseIds: ['o-1', 'o-2'] } },
    thresholds: { competenceGain: 0.1, oodGain: 0.05, projectGain: 0.1, maxProxyGap: 0.2 } });
}

function pairs(prefix, gain) {
  return [1, 2].map((index) => ({ caseId: `${prefix}-${index}`, baselineScore: 0.4,
    candidateScore: 0.4 + gain, reportedReward: 0.4 + gain }));
}

function generation(ordinal, parentId) {
  return { ordinal, parentId, candidateId: `candidate-${ordinal}`, evaluatorId: 'eval',
    selectionDatasetHash: 'a'.repeat(64), measurements: {
      evolution: pairs('e', 0.18), holdout: pairs('h', 0.15), ood: pairs('o', 0.1) } };
}

function projectWindows() {
  return ['ctx-a', 'ctx-b', 'ctx-c'].map((contextHash, index) => ({
    observationId: `project-${index}`, contextHash, responsibilityId: 'delivery-api',
    candidateId: 'candidate-3', baselineOutcome: 0.5, candidateOutcome: 0.7
  }));
}

const plan = fixturePlan();
const evaluation = evaluateCampaign(plan, [generation(1, 'seed'), generation(2, 'candidate-1'), generation(3, 'candidate-2')]);
const review = buildCausalReview(plan, { campaignEvaluation: evaluation, projectWindows: projectWindows() });
assert.equal(review.competence, true);
assert.equal(review.longitudinalProjectBenefit.supported, true);
assert.equal(review.status, 'awaiting_independent_verification');

const receipt = issueReceipt({ resultId: plan.campaignId, evidenceDigest: review.reviewDigest,
  verifierDigest: getVerifier('proof').digest, status: 'verified', independent: true,
  coveredObligations: OBLIGATIONS });
const verification = { actorId: 'verify', reviewDigest: review.reviewDigest, receipt };
const authorization = { authorizerId: 'authorize', reviewDigest: review.reviewDigest,
  decision: 'approve_promotion_review', authorizationId: 'approval-1', authorizedAt: new Date().toISOString() };
const approved = authorizePromotionReview(plan, { review, verification, authorization });
assert.equal(approved.status, 'eligible_for_external_promotion_request');
assert.equal(approved.promotionAllowed, false);
assert.equal(approved.promotionExecuted, false);

const dependentReceipt = issueReceipt({ ...receipt, independent: false });
assert.equal(authorizePromotionReview(plan, { review,
  verification: { ...verification, receipt: dependentReceipt }, authorization }).status, 'promotion_review_rejected');
assert.equal(authorizePromotionReview(plan, { review, verification,
  authorization: { ...authorization, authorizerId: 'builder' } }).status, 'promotion_review_rejected');
assert.throws(() => buildCausalReview(plan, { campaignEvaluation: evaluation,
  projectWindows: projectWindows().map((window) => ({ ...window, responsibilityId: 'other' })) }), /scope-invalid/);

console.log('AIDE2 causal promotion review checks passed.');
