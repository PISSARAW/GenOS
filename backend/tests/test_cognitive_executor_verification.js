'use strict';
const assert = require('node:assert/strict');
const {
  toFalsificationHypotheses,
  falsifyGeneratedProposals,
  assessScientificValidity,
  verifyGeneratedHypotheses
} = require('../src/services/cognitiveExecutor');

async function main() {
  const proposals = [
    { id: 'h1', hypothesis: 'Stale cache causes failure.', verification: 'unverified' },
    { id: 'h2', hypothesis: 'Missing auth check causes failure.', verification: 'unverified' }
  ];
  const hypotheses = toFalsificationHypotheses(proposals);
  assert.strictEqual(hypotheses.length, 2);
  assert.strictEqual(hypotheses[0].statement, 'Stale cache causes failure.');

  const falsification = await falsifyGeneratedProposals({
    generated: { proposals },
    evidence: [{ hypothesisId: 'h1', falsified: true }]
  });
  assert.strictEqual(falsification.totalHypotheses, 2);
  assert.ok(Array.isArray(falsification.retainedHypotheses));
  assert.ok(Array.isArray(falsification.falsifiedHypotheses));
  assert.strictEqual(falsification.promotionEligible, false);

  const validity = assessScientificValidity({
    receipts: [],
    trustedVerifierDigests: []
  });
  assert.strictEqual(validity.valid, false);

  const result = await verifyGeneratedHypotheses({
    generated: { proposals },
    evidence: [],
    receipts: []
  });
  assert.strictEqual(result.promotionEligible, false);
  assert.ok(result.falsification);
  assert.ok(result.scientificValidity);

  console.log('Cognitive executor verification path: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
