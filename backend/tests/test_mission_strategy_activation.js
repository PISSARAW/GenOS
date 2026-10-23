'use strict';

const assert = require('node:assert/strict');
const { compileAndAttachMissionStrategy, applyMissionStrategyToContext, strategyInput } = require('../src/services/agentRuntimeAdapter/missionStrategyActivation');

function context(workers = []) {
  return {
    normalizedMission: { prompt: 'Verify a bounded claim', executionBudget: { tokens: 3000 } },
    autonomyPlan: { selectedTopology: 'trinity', profile: { domain: 'verification' },
      operationalConstraints: { daemonAllowed: true },
      tokenPolicy: { total: 3000 }, dispatchWorkers: workers }
  };
}

function strategy(workerKind = 'verifier_worker', methodId = 'prompt_defined') {
  return { version: 1, status: 'proposed', phases: [{ id: 'verify', workerKind,
    methodContract: { version: 1, methodId, requiredCapabilities: ['verify'] } }] };
}

function testCompatibleAttachment() {
  const ctx = context([{ workerKind: 'verifier_worker', role: 'verifier' }]);
  const lease = ['read'];
  ctx.autonomyPlan.dispatchWorkers[0].toolLease = lease;
  let input;
  const result = compileAndAttachMissionStrategy(ctx, { compileMissionStrategy: (value) => {
    input = value;
    return strategy();
  } });
  assert.equal(result.attached, true);
  assert.equal(input.selectedTopology, 'trinity');
  assert.equal(input.budget.tokens, 3000);
  assert.equal(input.operationalConstraints.daemonAllowed, true);
  assert.equal(input.workerAssignments[0].workerKind, 'verifier_worker');
  assert.equal(ctx.autonomyPlan.dispatchWorkers[0].methodContract.methodId, 'prompt_defined');
  assert.equal(ctx.autonomyPlan.dispatchWorkers[0].workerKind, 'verifier_worker');
  assert.strictEqual(ctx.autonomyPlan.dispatchWorkers[0].toolLease, lease);
  assert.strictEqual(ctx.autonomyPlan.morphogenesisStrategy, ctx.normalizedMission.morphogenesisStrategy);
  assert.equal(result.strategy.status, 'proposed');
}

function testAdvisoryWhenIncompatible() {
  const worker = { workerKind: 'bounded_worker', role: 'executor' };
  const ctx = context([worker]);
  const result = applyMissionStrategyToContext(ctx, strategy());
  assert.equal(result.attached, false);
  assert.equal(result.activation.status, 'advisory');
  assert.equal(worker.methodContract, undefined);
  assert.equal(ctx.normalizedMission.morphogenesisStrategy.status, 'proposed');
}

function testExplicitContractPreserved() {
  const existing = { version: 1, methodId: 'causal_analysis' };
  const worker = { workerKind: 'verifier_worker', methodContract: existing };
  const ctx = context([worker]);
  const result = applyMissionStrategyToContext(ctx, strategy());
  assert.equal(result.attached, false);
  assert.strictEqual(worker.methodContract, existing);
  assert.equal(result.activation.status, 'advisory');
}

function testNativeMethodWithoutInputsRemainsAdvisory() {
  const worker = { workerKind: 'verifier_worker' };
  const ctx = context([worker]);
  const result = applyMissionStrategyToContext(ctx, strategy('verifier_worker', 'verify_procedure'));
  assert.equal(result.attached, false);
  assert.equal(worker.methodContract, undefined);
}

function testMissionAssignmentContractPreserved() {
  const worker = { workerKind: 'verifier_worker' };
  const ctx = context([worker]);
  ctx.normalizedMission.workerAssignments = [{ methodContract: { version: 1, methodId: 'verify_procedure' } }];
  const result = applyMissionStrategyToContext(ctx, strategy());
  assert.equal(result.attached, false);
  assert.equal(result.activation.reason, 'explicit_method_contract_present');
  assert.equal(worker.methodContract, undefined);
}

function testBlockedProposalRetained() {
  const ctx = context([{ workerKind: 'verifier_worker' }]);
  const blocked = { ...strategy(), status: 'blocked', errors: ['capability unavailable'] };
  const result = compileAndAttachMissionStrategy(ctx, { compileMissionStrategy: () => blocked });
  assert.equal(result.attached, false);
  assert.equal(result.activation.reason, 'strategy_blocked');
  assert.deepEqual(ctx.autonomyPlan.morphogenesisStrategy.errors, blocked.errors);
  assert.equal(ctx.autonomyPlan.dispatchWorkers[0].methodContract, undefined);
}

function testFleetConsumesAttachedMethod() {
  const ctx = context([{ workerKind: 'verifier_worker', role: 'verifier' }]);
  applyMissionStrategyToContext(ctx, strategy());
  const assignment = ctx.autonomyPlan.dispatchWorkers[0];
  const kinds = require('../src/services/agents/workerKindService');
  const contract = kinds.buildWorkerContract(assignment.workerKind, {
    prompt: ctx.normalizedMission.prompt, methodContract: assignment.methodContract
  });
  const identity = require('../src/services/agentFleetWorkers').workerIdentity({
    id: 'worker-1', identity: { name: 'Verifier', introduction: 'Verifier' }, assignment,
    parent: { id: 'orchestrator-1' }, plan: ctx.autonomyPlan, prompt: 'Verify', workerContract: contract
  });
  assert.deepEqual(identity.methodContract, assignment.methodContract);
  assert.deepEqual(identity.workerContract.mission.methodContract, assignment.methodContract);
}

function testRealCompilerStaysAdvisoryWithoutNativeInputs() {
  const ctx = context([{ workerKind: 'verifier_worker', role: 'verifier' }]);
  const result = compileAndAttachMissionStrategy(ctx);
  assert.equal(result.attached, false);
  assert.equal(ctx.autonomyPlan.dispatchWorkers[0].methodContract, undefined);
  assert.equal(ctx.normalizedMission.morphogenesisStrategy.status, 'blocked');
}

function testCompilerFailureClosed() {
  const ctx = context([{ workerKind: 'verifier_worker' }]);
  const result = compileAndAttachMissionStrategy(ctx, { compileMissionStrategy: () => { throw new Error('failed'); } });
  assert.equal(result.attached, false);
  assert.equal(result.reason, 'strategy_compilation_failed');
  assert.equal(ctx.autonomyPlan.dispatchWorkers[0].methodContract, undefined);
  assert.equal(ctx.autonomyPlan.morphogenesisStrategy, undefined);
}

function testTopologyCapabilitiesComeFromAuditedPlatformRegistry() {
  const ctx = context([{ workerKind: 'verifier_worker', capabilities: ['invented_worker_claim'] }]);
  const available = strategyInput(ctx).availableTopologyCapabilities;
  const operational = require('../src/services/capabilityAccessMatrix').fullMatrix()
    .filter((entry) => entry.state === 'operationnel').map((entry) => entry.capability);
  assert.deepEqual(available, operational);
  assert.equal(available.includes('invented_worker_claim'), false);
}

function testExplicitTopologyCapabilityInventoryIsPreserved() {
  const ctx = context();
  ctx.normalizedMission.topologyCapabilityInventory = { available: [] };
  assert.deepEqual(strategyInput(ctx).availableTopologyCapabilities, []);
}

testCompatibleAttachment();
testAdvisoryWhenIncompatible();
testExplicitContractPreserved();
testNativeMethodWithoutInputsRemainsAdvisory();
testMissionAssignmentContractPreserved();
testBlockedProposalRetained();
testFleetConsumesAttachedMethod();
testRealCompilerStaysAdvisoryWithoutNativeInputs();
testCompilerFailureClosed();
testTopologyCapabilitiesComeFromAuditedPlatformRegistry();
testExplicitTopologyCapabilityInventoryIsPreserved();
console.log('mission strategy activation: PASS');
