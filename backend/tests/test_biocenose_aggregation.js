'use strict';

const assert = require('node:assert/strict');
const { aggregateCommunityJudgments } = require('../src/services/biocenoseService');

const factual = aggregateCommunityJudgments({
  questionType: 'FACTUAL', claims: [{ claimId: 'c1' }, { claimId: 'c2' }],
  verificationReceipts: [{ claimId: 'c1', status: 'VERIFIED' }]
});
assert.deepEqual(factual.verifiedClaimIds, ['c1']);
assert.deepEqual(factual.unresolvedClaimIds, ['c2']);

const probabilistic = aggregateCommunityJudgments({
  questionType: 'PROBABILISTIC', forecasts: [
    { eventId: 'e1', probability: 0.4 }, { eventId: 'e1', probability: 0.8 }
  ]
});
assert.ok(Math.abs(probabilistic.estimates[0].probability - 0.6) < 1e-9);
assert.equal(probabilistic.estimates[0].weighting, 'equal_fallback');

const forecasting = aggregateCommunityJudgments({
  questionType: 'PROBABILISTIC', variantPolicy: { requireCalibrationWeights: true }, forecasts: [
    { eventId: 'e1', probability: 0.4 }, { eventId: 'e1', probability: 0.8 }
  ]
});
assert.equal(forecasting.outcome, 'INSUFFICIENT_FORECASTS');

const normative = aggregateCommunityJudgments({
  questionType: 'NORMATIVE', judgments: [
    { memberId: 'm1', judgment: { position: 'A' } }, { memberId: 'm2', judgment: { position: 'B' } }
  ]
});
assert.equal(normative.outcome, 'PLURALISM_PRESERVED');
assert.equal(normative.perspectives.length, 2);

const pareto = aggregateCommunityJudgments({
  questionType: 'MULTI_CRITERIA', criteria: [{ key: 'quality', direction: 'max' }, { key: 'cost', direction: 'min' }], options: [
    { optionId: 'a', criteria: { quality: 8, cost: 4 } },
    { optionId: 'b', criteria: { quality: 7, cost: 5 } },
    { optionId: 'c', criteria: { quality: 9, cost: 3 } }
  ]
});
assert.deepEqual(pareto.options, ['c']);

process.stdout.write('Biocenose aggregation checks: PASS\n');
