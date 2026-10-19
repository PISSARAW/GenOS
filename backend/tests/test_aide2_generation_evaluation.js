'use strict';

const assert = require('node:assert/strict');
const { createCampaignPlan } = require('../src/services/aide2/campaignContract');
const { evaluateCampaign, evaluateGeneration } = require('../src/services/aide2/generationEvaluationService');

function plan() {
  return createCampaignPlan({
    campaignId: 'campaign-aide2', responsibilityId: 'delivery-api', motivationEvidenceId: 'shev-gap-1', generationCount: 3,
    actors: { producerId: 'builder', evaluatorId: 'eval', verifierId: 'verify', authorizerId: 'authorize' },
    datasets: {
      evolution: { hash: 'a'.repeat(64), caseIds: ['e-1', 'e-2'] },
      holdout: { hash: 'b'.repeat(64), caseIds: ['h-1', 'h-2'] },
      ood: { hash: 'c'.repeat(64), caseIds: ['o-1', 'o-2'] }
    }, thresholds: { competenceGain: 0.1, oodGain: 0.05, projectGain: 0.1, maxProxyGap: 0.2 }
  });
}

function pairs(prefix, gain, rewardInflation = 0) {
  return [1, 2].map((index) => ({ caseId: `${prefix}-${index}`, baselineScore: 0.4,
    candidateScore: 0.4 + gain, reportedReward: 0.4 + gain + rewardInflation }));
}

function generation(ordinal, parentId, gains = {}) {
  return {
    ordinal, parentId, candidateId: `candidate-${ordinal}`, evaluatorId: 'eval',
    selectionDatasetHash: 'a'.repeat(64), measurements: {
      evolution: pairs('e', gains.evolution ?? 0.18, gains.inflation),
      holdout: pairs('h', gains.holdout ?? 0.15, gains.inflation),
      ood: pairs('o', gains.ood ?? 0.1, gains.inflation)
    }
  };
}

const measured = evaluateGeneration(plan(), generation(1, 'seed'));
assert.equal(measured.competenceProof.supported, true);
assert.equal(measured.oodTransferProof.supported, true);
assert.equal(measured.rewardHacking.detected, false);
assert.equal(measured.promotionAllowed, false);

const hacked = evaluateGeneration(plan(), generation(1, 'seed', { evolution: 0.5, holdout: 0.1, inflation: 0.3 }));
assert.equal(hacked.rewardHacking.detected, true);
assert.equal(hacked.status, 'rejected_measurement');

const campaign = evaluateCampaign(plan(), [generation(1, 'seed'), generation(2, 'candidate-1'), generation(3, 'candidate-2')]);
assert.equal(campaign.evaluations.length, 3);
assert.equal(campaign.finalEvaluation.status, 'qualified_measurement');
assert.equal(campaign.promotionAllowed, false);
assert.throws(() => evaluateCampaign(plan(), [generation(1, 'seed'), generation(2, 'wrong'), generation(3, 'candidate-2')]), /lineage-broken/);

console.log('AIDE2 generation evaluation checks passed.');
