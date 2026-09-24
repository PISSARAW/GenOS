'use strict';

const assert = require('node:assert/strict');
const reviewerRouter = require('../src/services/biocenose/review/reviewerRouter');
const verifierRouter = require('../src/services/biocenose/verification/verifierRouter');

const members = [
  { memberId: 'reviewer-1', role: 'reviewer', expertise: ['security'] },
  { memberId: 'reviewer-2', role: 'reviewer', expertise: ['evidence'] },
  { memberId: 'verifier-1', role: 'verifier', deterministicChecks: ['replay', 'tests'] },
  { memberId: 'verifier-2', role: 'verifier', deterministicChecks: ['formal proof'] }
];
const securityClaim = { claimId: 'claim-1', type: 'security', verificationKinds: ['replay'] };
const review = reviewerRouter.route({ claim: securityClaim, members });
const verification = verifierRouter.route({ claim: securityClaim, members });
const noVerifier = verifierRouter.route({ claim: { type: 'normative' }, members });
const quarantined = reviewerRouter.route({
  claim: securityClaim,
  members: [{ memberId: 'blocked-reviewer', role: 'reviewer', status: 'QUARANTINED', expertise: ['security'] }]
});
const quarantinedVerifier = verifierRouter.route({
  claim: securityClaim,
  members: [{ memberId: 'blocked-verifier', role: 'verifier', status: 'QUARANTINED', deterministicChecks: ['replay'] }]
});
const adversarialReview = reviewerRouter.route({
  claim: securityClaim,
  policy: { requireAdversarialReviewer: true },
  members: [
    { memberId: 'standard-reviewer', role: 'reviewer', expertise: ['security'] },
    { memberId: 'red-reviewer', role: 'adversarial_reviewer', expertise: ['security'] }
  ]
});
const missingAdversarialReviewer = reviewerRouter.route({
  claim: securityClaim, policy: { requireAdversarialReviewer: true }, members
});

assert.deepEqual(review.reviewers.map((entry) => entry.memberId), ['reviewer-1']);
assert.equal(review.reviewers[0].specialties.includes('adversarial'), true);
assert.deepEqual(verification.verifiers, [{ memberId: 'verifier-1', kinds: ['replay'] }]);
assert.equal(verification.priority, 'DETERMINISTIC_VERIFIER_FIRST');
assert.equal(noVerifier.status, 'UNVERIFIED');
assert.equal(quarantined.unassigned, true);
assert.equal(quarantinedVerifier.deterministicAvailable, false);
assert.deepEqual(adversarialReview.reviewers.map((entry) => entry.memberId), ['red-reviewer']);
assert.equal(missingAdversarialReviewer.requiredReviewerMissing, true);
process.stdout.write('Biocenose reviewer/verifier routing checks: PASS\n');
