'use strict';

const assert = require('node:assert/strict');
const { buildSocialMentalModel } = require('../src/services/socialMentalModelService');
const { applyMemoryIntervention } = require('../src/services/socialMentalModelInterventionService');
const { evaluateSocialMetacognition } = require('../src/services/socialMetacognitionCampaignService');
const { validateSocialWorldReport } = require('../src/services/socialWorldReportValidator');

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

function arm(input) {
  return { model: input.model, decision: decision(input.action, `decision-${input.armId}`, input.model.sourceMemoryIds),
    interventionReceipt: input.receipt };
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
  const baselineModel = build(memories);
  const baselineArms = ['static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'];
  const arms = Object.fromEntries([
    ['genos-full', arm({ model: baselineModel, action: 'propose-collaboration', armId: 'genos-full', receipt: {
      mode: 'baseline', interventionId: 'untouched-full', beforeHash: 'baseline-hash', afterHash: 'baseline-hash' } })],
    ...baselineArms.map((id) => [id, arm({ model: build(memories), action: 'propose-collaboration', armId: id, receipt: {
      mode: 'baseline', interventionId: `untouched-${id}`, beforeHash: 'baseline-hash', afterHash: 'baseline-hash' } })]),
    ['genos-social-memory-ablated', arm({ model: build(masked.memories), action: 'ask-for-update',
      armId: 'genos-social-memory-ablated', receipt: masked.receipt })],
    ['genos-social-memory-counterfactual', arm({ model: build(counterfactual.memories), action: 'wait-for-reconciliation',
      armId: 'genos-social-memory-counterfactual', receipt: counterfactual.receipt })],
  ]);
  return { memories, masked, counterfactual, arms };
}

function main() {
  const test = fixture();
  assert.equal(test.masked.receipt.mode, 'mask-social-memories');
  assert.equal(test.counterfactual.receipt.addedMemoryIds.length, 4);
  assert.equal(test.masked.receipt.preservedNonSocialMemoryHash, test.counterfactual.receipt.preservedNonSocialMemoryHash);
  assert.deepEqual(test.masked.memories.filter((item) => item.id === 'unrelated'),
    [test.memories.find((item) => item.id === 'unrelated')]);
  const expectedActions = require('../../benchmarks/social-world/campaigns/socialworld-v2/V2-06-case.json').expectedActions;
  const result = evaluateSocialMetacognition({ arms: test.arms, expectedActions });
  assert.equal(result.status, 'pass');
  assert.ok(result.evidenceRefs.includes('decision-genos-full'));
  assert.equal(result.evidenceRefs.includes('mask-1'), true);
  const report = { campaignId: 'socialworld-v2', scenario: 'V2-06', arm: 'genos-full', seed: 'test-seed', attempt: 1,
    sourceCommit: 'abcdef0', runtimeVersion: '3', model: null, configHash: 'a'.repeat(64), status: 'pass',
    startedAt: '2026-10-24T00:00:00.000Z', durationMs: 1, inputs: {}, observed: {},
    oracle: { status: 'pass', caseId: 'v2-06-collaboration-after-disagreement-v1' },
    evidenceRefs: result.evidenceRefs, violations: [], limitations: [],
    caseId: 'v2-06-collaboration-after-disagreement-v1', arms: test.arms };
  assert.equal(validateSocialWorldReport(report).valid, true, JSON.stringify(validateSocialWorldReport(report)));
  assert.equal(validateSocialWorldReport({ ...report, arms: { ...test.arms, 'llm-with-memory': undefined } }).valid, false);
  assert.equal(validateSocialWorldReport({ ...report, arms: { ...test.arms, extra: test.arms['genos-full'] } }).valid, false);
  const divergentContext = fixture();
  divergentContext.arms['genos-social-memory-ablated'].decision.permissionHash = 'permissions-changed';
  assert.equal(evaluateSocialMetacognition({ arms: divergentContext.arms, expectedActions }).status, 'fail');
  const missingArm = fixture();
  delete missingArm.arms['llm-with-memory'];
  assert.equal(evaluateSocialMetacognition({ arms: missingArm.arms, expectedActions }).status, 'inconclusive');
  const unexpectedArm = fixture();
  unexpectedArm.arms.extra = unexpectedArm.arms['genos-full'];
  assert.equal(evaluateSocialMetacognition({ arms: unexpectedArm.arms, expectedActions }).status, 'inconclusive');
  const wrongIntervention = fixture();
  wrongIntervention.arms['genos-social-memory-counterfactual'].interventionReceipt.mode = 'baseline';
  assert.equal(evaluateSocialMetacognition({ arms: wrongIntervention.arms, expectedActions }).status, 'fail');
  assert.equal(evaluateSocialMetacognition({ arms: {} }).status, 'inconclusive');
  assert.throws(() => applyMemoryIntervention({ mode: 'mask-social-memories', interventionId: 'bad',
    memories: test.memories, socialMemoryIds: ['missing'] }), { code: 'SOCIAL_INTERVENTION_INVALID' });
  console.log('SocialWorld V2-06 oracle: six manifest arms and the three-condition memory intervention passed.');
}

try { main(); }
catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
