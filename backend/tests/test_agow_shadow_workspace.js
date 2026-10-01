'use strict';

const assert = require('node:assert/strict');
const frameAdapter = require('../src/services/agow/counterfactual/counterfactualFrameAdapter');
const triggerPolicy = require('../src/services/agow/counterfactualTriggerPolicyService');
const policy = require('../src/services/agow/agowMechanismPolicyService');
const shadow = require('../src/services/agow/counterfactual/shadowWorkspaceService');
const candidateAdapter = require('../src/services/agow/candidates/candidateAdapterService');
const frameService = require('../src/services/agow/workspaceFrameService');

function candidates() {
  return ['one', 'two'].map((candidateId) => candidateAdapter.build({ module: 'perception', agentId: 'agent',
    now: 100, observation: { candidateId, confidence: 0.5, evidenceRefs: ['evidence'] } }));
}

function testBranchesAndProvenance() {
  const source = candidates();
  const frame = frameService.create({ agentId: 'agent', cycle: 1, selected: source,
    settings: { activeGoal: 'goal' }, now: 100 });
  const branches = frameAdapter.branchDefinitions(frame, source);
  assert.equal(branches.length, 3);
  const namespace = require('../src/services/agow/counterfactualCandidateGuard').registerSimulation({
    simulationId: 'test-simulation', realAgentId: 'agent', parentRealityFrameId: frame.frameId
  });
  const forked = frameAdapter.candidatesForBranch({ branch: branches[0], candidates: source,
    simulationId: 'test-simulation', simulationAgentId: namespace.simulationAgentId,
    parentFrameId: frame.frameId, now: 101 });
  assert.equal(forked.length, 1);
  assert.equal(forked[0].epistemicOrigin.origin, 'external_observed');
  assert.equal(forked[0].epistemicOrigin.realityMode, 'counterfactual');
  assert.equal(forked[0].epistemicOrigin.simulationId, 'test-simulation');
  require('../src/services/agow/counterfactualCandidateGuard').releaseSimulation('test-simulation');
}

function testTriggerAndPolicy() {
  const source = candidates();
  source[0].epistemicContext = { irreversibility: 0.9 };
  const frame = { epistemicState: { uncertainty: 0 }, causalContext: { predictionError: 0 } };
  assert.deepEqual(triggerPolicy.shouldSimulate({ frame, candidates: source }).triggeredBy, ['irreversible_decision']);
  assert.equal(policy.controlsRegret('shadow'), false);
  assert.equal(policy.controlsRegret('bounded'), true);
  assert.equal(policy.publishesCounterfactual('shadow'), false);
  assert.equal(policy.publishesCounterfactual('advisory'), true);
  assert.deepEqual(shadow.limits({ maxFrames: 9, maxQueries: 0, maxWorkers: 1, maxCost: 0 }),
    { maxFrames: 3, maxQueries: 0, maxWorkers: 1, maxCost: 0 });
}

testBranchesAndProvenance();
testTriggerAndPolicy();
console.log('✅ AGOW shadow workspace branches, policy and budgets passed');
