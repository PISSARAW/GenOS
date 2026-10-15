'use strict';

const assert = require('node:assert/strict');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { topologyExpression } = require('../src/services/morphogenesis/expression/morphologyExpression');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const { admitMorphogenesisStrategy, admitPlannerTransition } = require('../src/services/morphogenesis/morphogenesisStrategyAdmission');

const registry = createTopologyRegistry();
const required = registry.get('a_team').requiredCapabilities;
const candidate = { id: 'topology:a_team:default', candidateId: 'topology:a_team:default',
  kind: 'TOPOLOGY', topology: 'a_team', variant: null, eligible: true,
  proposalEligible: true, validation: { valid: true }, requiredCapabilities: required };
const policy = { kind: 'conditional_morphogenesis_policy', status: 'proposed',
  decision: { recipe: { candidateId: candidate.id, topology: candidate.topology, variant: null } },
  portfolio: { candidates: [candidate], ranking: { decision: { decision: 'PROPOSE', selectedId: candidate.id },
    candidates: [{ id: candidate.id, topology: candidate.topology, variant: null, eligible: true,
      proposalEligible: true }] } } };
const plan = { selectedTopology: 'rhizome', selectedVariant: 'default',
  workerAssignments: [{ workerKind: 'analyst', capabilities: required }],
  allocatedTokens: 50, requestedTools: ['genos_change_organization'] };
const gates = { policy, actualPlan: plan, registry, now: 100000,
  quiescence: { confirmed: true, observedAt: 100000, activeProcesses: 0,
    databaseRunningWorkers: 0, activeLeases: 0 },
  topologyCapabilities: required, availableWorkerKinds: ['analyst'],
  budget: { availableTokens: 100 },
  parentLease: { allowedTools: ['genos_change_organization'] } };
const plannerPolicy = { ...policy, diagnosis: { signals: { uncertainty: 0.8 } } };
const plannerPlan = { ...plan, selectedTopology: 'a_team', selectedVariant: 'default',
  morphologyPatch: { graph: compileExpression(topologyExpression('a_team'),
    { mission: 'mission', missionId: 'mission-1', globalBudget: { tokens: 50 } }) } };

function testAdmittedRecipeBindsTheActualPlan() {
  const result = admitMorphogenesisStrategy(gates);
  assert.equal(result.status, 'admitted');
  assert.equal(result.executionAuthorized, true);
  assert.equal(result.actualPlan.selectedTopology, 'a_team');
  assert.equal(result.actualPlan.selectedVariant, 'default');
  assert.equal(result.actualPlan.workerAssignments[0].topology, 'a_team');
  assert.equal(plan.selectedTopology, 'rhizome', 'input plan stays immutable');
}

function testMissingAuthorityOrFreshQuiescenceFailsClosed() {
  const noLease = admitMorphogenesisStrategy({ ...gates,
    parentLease: { allowedTools: ['read'] } });
  assert.equal(noLease.status, 'denied');
  assert.equal(noLease.executionAuthorized, false);
  assert.equal(noLease.reason, 'morphogenesis_lease_missing');
  const stale = admitMorphogenesisStrategy({ ...gates,
    quiescence: { ...gates.quiescence, observedAt: 1 } });
  assert.equal(stale.reason, 'quiescence_evidence_stale');
}

function testBudgetCapabilitiesAndPolicyProposalAreMandatory() {
  assert.equal(admitMorphogenesisStrategy({ ...gates, budget: { availableTokens: 10 } }).reason,
    'token_budget_exceeded');
  assert.equal(admitMorphogenesisStrategy({ ...gates, topologyCapabilities: [] }).reason,
    'topology_capabilities_missing');
  const advisoryOnly = { ...policy, portfolio: { ranking: { decision: { decision: 'ABSTAIN' }, candidates: [candidate] } } };
  assert.equal(admitMorphogenesisStrategy({ ...gates, policy: advisoryOnly }).reason,
    'recipe_not_proposed_by_policy_portfolio');
}

function testPlannerHeuristicTransitionIsAdmittedWithExplicitBasis() {
  const result = admitPlannerTransition({ ...gates, policy: plannerPolicy, actualPlan: plannerPlan });
  assert.equal(result.status, 'admitted');
  assert.equal(result.selectionBasis, 'planner_heuristic_unvalidated');
  assert.equal(result.comparativeQuality, 'unknown');
  assert.equal(result.gates.policyProposal, false);
  assert.equal(result.actualPlan.selectedTopology, 'a_team');
}

function testPlannerTransitionRejectsGraphMismatch() {
  const mismatch = { ...plannerPlan, selectedTopology: 'rhizome' };
  assert.equal(admitPlannerTransition({ ...gates, policy: plannerPolicy,
    actualPlan: mismatch }).reason, 'planner_transition_graph_mismatch');
}

testAdmittedRecipeBindsTheActualPlan();
testMissingAuthorityOrFreshQuiescenceFailsClosed();
testBudgetCapabilitiesAndPolicyProposalAreMandatory();
testPlannerHeuristicTransitionIsAdmittedWithExplicitBasis();
testPlannerTransitionRejectsGraphMismatch();
console.log('Morphogenesis strategy admission tests passed.');
