'use strict';

const assert = require('node:assert/strict');
const { aggregateCommunityJudgments } = require('../src/services/biocenoseService');
const aggregationService = require('../src/services/biocenose/question/communityAggregationService');
const argumentationSemantics = require('../src/services/biocenose/argumentation/argumentationSemantics');

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

const labels = argumentationSemantics.evaluate({
  claims: [{ claimId: 'source' }, { claimId: 'target' }],
  arguments: [
    { argumentId: 'support', claimId: 'source', createdBy: 'reviewer-1', relation: 'SUPPORT' },
    { argumentId: 'attack', claimId: 'source', createdBy: 'reviewer-2', relation: 'ATTACK',
      argument: { targetClaimId: 'target' } }
  ]
});
assert.equal(labels[0].status, 'ACCEPTED');
assert.equal(labels[1].status, 'REJECTED');
assert.equal(labels[1].attackingArgumentIds[0], 'attack');

const emptyArgumentation = aggregationService.aggregate({
  questionType: 'EXPLORATORY', claims: [], variantPolicy: { name: 'argumentation_community' }
});
assert.equal(emptyArgumentation.outcome, 'ARGUMENTS_UNRESOLVED');

const delphi = aggregationService.aggregate({
  questionType: 'NORMATIVE', variantPolicy: { name: 'delphi_community' }, judgments: [
    { memberId: 'm1', judgment: { position: 0 } },
    { memberId: 'm2', judgment: { position: null } },
    { memberId: 'm3', judgment: { position: 1 } }
  ]
});
assert.equal(delphi.delphi.distribution.find((item) => item.position === 'ABSTAIN').count, 1);
assert.equal(delphi.delphi.interquartileRange, 0.5);

process.stdout.write('Biocenose aggregation checks: PASS\n');
