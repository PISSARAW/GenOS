'use strict';

const assert = require('node:assert/strict');
const { buildSocialMentalModel } = require('../src/services/socialMentalModelService');
const { applyMemoryIntervention } = require('../src/services/socialMentalModelInterventionService');
const { evaluateSocialMetacognition } = require('../src/services/socialMetacognitionCampaignService');

function memory(id, overrides = {}) {
  return {
    id, subjectAgentId: 'agent-a', otherAgentId: 'agent-b', relationType: 'friend',
    polarity: 'supports', statement: `Shared experience ${id}.`, receiptId: `receipt-${id}`,
    occurredAt: '2026-10-20T10:00:00.000Z', ...overrides,
  };
}

function decision(action, receiptId, memoryReferences) {
  return { action, receiptId, memoryReferences, contextHash: 'ctx-1', budgetHash: 'budget-1', permissionHash: 'permissions-1' };
}

function arm(model, action, receipt) {
  return { model, decision: decision(action, `decision-${action}`, model.sourceMemoryIds), interventionReceipt: receipt };
}

function fixture() {
  const memories = [memory('social-1'), memory('social-2', { occurredAt: '2026-10-21T10:00:00.000Z' }),
    memory('social-3', { occurredAt: '2026-10-22T10:00:00.000Z' }),
    memory('social-4', { polarity: 'contradicts', occurredAt: '2026-10-23T10:00:00.000Z',
      statement: 'Their last collaboration ended in disagreement.',
      beliefAboutOther: { proposition: 'B thinks the disagreement was resolved.', confidence: 0.65 } }),
    memory('unrelated', { otherAgentId: 'agent-c' })];
  const masked = applyMemoryIntervention({ mode: 'mask-social-memories', interventionId: 'mask-1',
    memories, socialMemoryIds: ['social-1', 'social-2', 'social-3', 'social-4'] });
  const counterfactual = applyMemoryIntervention({ mode: 'counterfactual-social-memories', interventionId: 'replace-1',
    memories, socialMemoryIds: ['social-1', 'social-2', 'social-3', 'social-4'],
    replacementMemories: [memory('cf-1', { polarity: 'contradicts' }), memory('cf-2', { polarity: 'contradicts' }),
      memory('cf-3', { polarity: 'contradicts' }), memory('cf-4', { polarity: 'contradicts' })] });
  const build = (values) => buildSocialMentalModel({ subjectAgentId: 'agent-a', otherAgentId: 'agent-b', memories: values });
  const arms = {
    baseline: arm(build(memories), 'propose-collaboration', { mode: 'baseline' }),
    masked: arm(build(masked.memories), 'ask-for-update', masked.receipt),
    counterfactual: arm(build(counterfactual.memories), 'wait-for-reconciliation', counterfactual.receipt),
  };
  return { memories, masked, counterfactual, arms };
}

function main() {
  const test = fixture();
  assert.equal(test.masked.receipt.mode, 'mask-social-memories');
  assert.equal(test.counterfactual.receipt.addedMemoryIds.length, 4);
  assert.equal(test.masked.receipt.preservedNonSocialMemoryHash, test.counterfactual.receipt.preservedNonSocialMemoryHash);
  assert.deepEqual(test.masked.memories.filter((item) => item.id === 'unrelated'),
    [test.memories.find((item) => item.id === 'unrelated')]);
  const result = evaluateSocialMetacognition({ arms: test.arms, expectedActions: {
    baseline: 'propose-collaboration', masked: 'ask-for-update', counterfactual: 'wait-for-reconciliation',
  } });
  assert.equal(result.status, 'pass');
  assert.ok(result.evidenceRefs.includes('decision-propose-collaboration'));
  const divergentContext = fixture();
  divergentContext.arms.masked.decision.permissionHash = 'permissions-changed';
  assert.equal(evaluateSocialMetacognition({ arms: divergentContext.arms,
    expectedActions: { baseline: 'propose-collaboration', masked: 'ask-for-update', counterfactual: 'wait-for-reconciliation' } }).status, 'fail');
  assert.equal(evaluateSocialMetacognition({ arms: {} }).status, 'inconclusive');
  assert.throws(() => applyMemoryIntervention({ mode: 'mask-social-memories', interventionId: 'bad',
    memories: test.memories, socialMemoryIds: ['missing'] }), { code: 'SOCIAL_INTERVENTION_INVALID' });
  console.log('SocialWorld V2-06 oracle: paired memory interventions and later decisions passed.');
}

try { main(); }
catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
