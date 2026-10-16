'use strict';

const assert = require('node:assert/strict');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { topologyExpression } = require('../src/services/morphogenesis/expression/morphologyExpression');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const { admitMorphogenesisStrategy, admitPlannerTransition } =
  require('../src/services/morphogenesis/morphogenesisStrategyAdmission');
const { sealTransitionReceipt, verifyTransitionReceipt } =
  require('../src/services/morphogenesis/morphogenesisTransitionReceipt');

const registry = createTopologyRegistry();
const required = registry.get('a_team').requiredCapabilities;

function graph(missionId) {
  return compileExpression(topologyExpression('a_team'),
    { mission: 'mission', missionId, globalBudget: { tokens: 50 } });
}

function candidate(id) {
  return { id, candidateId: id, kind: 'TOPOLOGY', topology: 'a_team', variant: null,
    eligible: true, proposalEligible: true, validation: { valid: true },
    requiredCapabilities: required };
}

function gates(policy, plan) {
  const now = 100000;
  const roles = plan.workerAssignments.map((assignment, index) => ({ roleId: `role-${index + 1}`,
    workerKind: assignment.workerKind, status: 'READY', instanceId: `w-${index + 1}` }));
  return { policy, actualPlan: plan, registry, now,
    quiescence: { confirmed: true, observedAt: now, activeProcesses: 0,
      databaseRunningWorkers: 0, activeLeases: 0 },
    topologyCapabilities: required, availableWorkerKinds: ['analyst'],
    budget: { availableTokens: 100 },
    parentLease: { allowedTools: ['genos_change_organization'] },
    resourceResolution: { status: 'READY_FOR_ADMISSION', observedAt: now, roles },
    resourceReservation: { reserved: true,
      workers: roles.map((role) => ({ roleId: role.roleId, instanceId: role.instanceId })),
      daemons: [], revalidatedAt: now } };
}

function planFor(missionId) {
  return { selectedTopology: 'a_team', selectedVariant: 'default',
    morphologyPatch: { graph: graph(missionId) },
    workerAssignments: [{ workerKind: 'analyst', capabilities: required, tokenBudget: 50 }],
    allocatedTokens: 50, requestedTools: ['genos_change_organization'] };
}

function run() {
  const selected = candidate('topology:a_team:default');
  const alternative = candidate('topology:rhizome:default');
  const policy = { kind: 'conditional_morphogenesis_policy', status: 'proposed',
    decision: { recipe: { candidateId: selected.id, topology: 'a_team', variant: null } },
    portfolio: { candidates: [selected, alternative],
      ranking: { decision: { decision: 'PROPOSE', selectedId: selected.id },
        candidates: [
          { ...selected, eligible: true, proposalEligible: true },
          { ...alternative, eligible: true, proposalEligible: true }
        ] } } };
  const admitted = admitMorphogenesisStrategy(gates(policy, planFor('mission-1')));
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.comparativeQuality, 'unknown');
  assert.equal(admitted.counterfactual.sameMissionComparison, 'unobserved');
  assert.equal(admitted.counterfactual.comparativeClaim, 'prohibited');
  assert.equal(admitted.unexecutedAlternatives.length, 1);
  assert.equal(admitted.unexecutedAlternatives[0].candidateId, alternative.id);
  assert.equal(admitted.unexecutedAlternatives[0].outcome, 'unobserved');
  assert.equal(admitted.unexecutedAlternatives[0].comparativeQuality, 'unknown');

  const plannerPolicy = { ...policy, diagnosis: { signals: { uncertainty: 0.8 } } };
  const planner = admitPlannerTransition({ ...gates(plannerPolicy, planFor('mission-1')),
    policy: plannerPolicy, actualPlan: planFor('mission-1') });
  assert.equal(planner.status, 'admitted');
  assert.equal(planner.comparativeQuality, 'unknown');
  assert.equal(planner.counterfactual.comparativeClaim, 'prohibited');

  const worker = { agentId: 'worker-a', workerKind: 'analyst',
    morphologyTopology: 'a_team', morphologyVariant: 'default' };
  const adaptation = { receipt: { candidateId: admitted.recipe.id },
    admission: admitted,
    plan: { morphologyPatch: { graph: graph('mission-1') } },
    assignments: { 'worker-a': { workerKind: 'analyst', morphologyTopology: 'a_team',
      morphologyVariant: 'default' } } };
  const input = { state: { workers: new Map([[worker.agentId, worker]]) },
    survivors: [{ agentId: 'worker-a' }], adaptation,
    continuation: { workerTokens: [50], perWorkerTokens: 50 } };
  const receipt = sealTransitionReceipt(input);
  assert.equal(verifyTransitionReceipt(receipt), true);
  assert.equal(receipt.identity.comparativeQuality, 'unknown');
  assert.equal(receipt.identity.counterfactual.comparativeClaim, 'prohibited');
  assert.equal(receipt.identity.unexecutedAlternatives.length, 1);
  receipt.identity.unexecutedAlternatives = [];
  assert.equal(verifyTransitionReceipt(receipt), false);

  console.log('Morphogenesis admission counterfactual: unexecuted alternatives stay unobserved: PASS');
}

run();
