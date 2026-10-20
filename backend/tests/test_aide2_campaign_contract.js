'use strict';

const assert = require('node:assert/strict');
const { createCampaignPlan } = require('../src/services/aide2/campaignContract');

function input() {
  return {
    campaignId: 'campaign-aide2', responsibilityId: 'delivery-api', motivationEvidenceId: 'shev-gap-1',
    generationCount: 3,
    actors: { producerId: 'builder', evaluatorId: 'eval', verifierId: 'verify', authorizerId: 'authorize' },
    datasets: {
      evolution: { hash: 'a'.repeat(64), caseIds: ['e-1', 'e-2'] },
      holdout: { hash: 'b'.repeat(64), caseIds: ['h-1', 'h-2'] },
      ood: { hash: 'c'.repeat(64), caseIds: ['o-1', 'o-2'] }
    },
    thresholds: { competenceGain: 0.1, oodGain: 0.05, projectGain: 0.1, maxProxyGap: 0.2 }
  };
}

const plan = createCampaignPlan(input());
assert.equal(plan.generationCount, 3);
assert.equal(plan.selectionSplit, 'evolution');
assert.deepEqual(plan.sealedEvaluationSplits, ['holdout', 'ood']);
assert.equal(plan.promotionAuthority, 'none');
assert.throws(() => createCampaignPlan({ ...input(), generationCount: 2 }), /generations-insufficient/);
assert.throws(() => createCampaignPlan({ ...input(), actors: { ...input().actors, verifierId: 'builder' } }), /not-independent/);
assert.throws(() => createCampaignPlan({ ...input(), datasets: {
  ...input().datasets, holdout: { hash: 'b'.repeat(64), caseIds: ['e-2'] }
} }), /cases-overlap/);

console.log('AIDE2 campaign contract checks passed.');
