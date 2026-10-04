'use strict';

const assert = require('node:assert/strict');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'aeis-homeostatic-arbitration-test-secret';

const holobiont = require('../src/services/epistemic/epistemicHolobionteService');

async function run() {
  const review = await holobiont.immuneSymbiontReview({
    claim: 'High risk claim with no typed evidence',
    risk: { score: 1 },
    novelty: 1,
    validityDomain: { coverage: 0, constraints: 10 },
    contradictions: [{ weight: 1 }],
    epitopes: {},
  }, { cloneCount: 1 });

  assert.equal(review.homeostaticFeedback.reArbitrated, true);
  assert.equal(review.homeostaticFeedback.tier, 'inflamed');
  assert.equal(review.homeostaticFeedback.addedVerifiers.length, 2);
  assert.equal(review.pipeline.decision.assignedVerifiers.length, 3);
  assert.equal(review.verifierResults.summary.inconclusive, 3);
  assert.equal(review.verifierResults.summary.errors, 0);
  console.log('AEIS homeostatic re-arbitration expands verification under measured pressure.');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
