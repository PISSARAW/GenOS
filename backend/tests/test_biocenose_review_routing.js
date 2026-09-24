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

assert.deepEqual(review.reviewers.map((entry) => entry.memberId), ['reviewer-1']);
assert.equal(review.reviewers[0].specialties.includes('adversarial'), true);
assert.deepEqual(verification.verifiers, [{ memberId: 'verifier-1', kinds: ['replay'] }]);
assert.equal(verification.priority, 'DETERMINISTIC_VERIFIER_FIRST');
assert.equal(noVerifier.status, 'UNVERIFIED');
process.stdout.write('Biocenose reviewer/verifier routing checks: PASS\n');
