'use strict';

const assert = require('node:assert/strict');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { topologyExpression, nestExpression } = require('../src/services/morphogenesis/expression/morphologyExpression');
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
const plan = { selectedTopology: 'a_team', selectedVariant: 'default',
  morphologyPatch: { graph: compileExpression(topologyExpression('a_team'),
    { mission: 'mission', missionId: 'mission-1', globalBudget: { tokens: 50 } }) },
  workerAssignments: [{ workerKind: 'analyst', capabilities: required, tokenBudget: 50 }],
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

function candidateWith(patch) {
  return { ...candidate, ...patch };
}

function policyWith(cand) {
  return { kind: 'conditional_morphogenesis_policy', status: 'proposed',
    decision: { recipe: { candidateId: cand.candidateId, topology: cand.topology, variant: cand.variant || null } },
    portfolio: { candidates: [cand], ranking: { decision: { decision: 'PROPOSE', selectedId: cand.candidateId },
      candidates: [{ id: cand.candidateId, topology: cand.topology, variant: cand.variant || null,
        eligible: true, proposalEligible: true }] } } };
}

function testAdmittedRecipeBindsTheActualPlan() {
  const result = admitMorphogenesisStrategy(gates);
  assert.equal(result.status, 'admitted');
  assert.equal(result.executionAuthorized, true);
  assert.equal(result.actualPlan.selectedTopology, 'a_team');
  assert.equal(result.actualPlan.selectedVariant, 'default');
  assert.equal(result.actualPlan.workerAssignments[0].topology, 'a_team');
  assert.notEqual(result.actualPlan, plan, 'admission returns a plan copy');
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

function testQuiescenceRequiresFreshConfirmedBoundary() {
  assert.equal(admitMorphogenesisStrategy({ ...gates, quiescence: null }).reason,
    'quiescence_evidence_missing');
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    quiescence: { ...gates.quiescence, confirmed: false } }).reason,
  'quiescence_evidence_missing');
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    quiescence: { ...gates.quiescence, activeProcesses: 1 } }).reason,
  'runtime_not_quiescent');
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    quiescence: { ...gates.quiescence, observedAt: 100001 } }).reason,
  'quiescence_evidence_stale');
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

function testBudgetCoherenceIsMandatory() {
  const mismatch = { ...plan, workerAssignments: [{ workerKind: 'analyst', capabilities: required, tokenBudget: 40 }] };
  assert.equal(admitMorphogenesisStrategy({ ...gates, actualPlan: mismatch }).reason,
    'worker_budget_allocation_mismatch');
  assert.equal(admitMorphogenesisStrategy({ ...gates, budget: {} }).reason,
    'token_budget_evidence_missing');
}

function testWorkerAssignmentsAndKindsAreMandatory() {
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    actualPlan: { ...plan, workerAssignments: [] } }).reason,
  'worker_assignments_invalid');
  const oversized = Array.from({ length: 13 }, () => ({ workerKind: 'analyst', capabilities: required, tokenBudget: 4 }));
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    actualPlan: { ...plan, workerAssignments: oversized } }).reason,
  'worker_assignments_invalid');
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    actualPlan: { ...plan, workerAssignments: [{ workerKind: 'unknown_kind', capabilities: required, tokenBudget: 50 }] } }).reason,
  'worker_kind_unavailable');
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    actualPlan: { ...plan, workerAssignments: [{ workerKind: 'analyst', capabilities: [], tokenBudget: 50 }] } }).reason,
  'worker_capabilities_missing');
  assert.equal(admitMorphogenesisStrategy({ ...gates, availableWorkerKinds: null }).reason,
    'worker_kind_inventory_unknown');
}

function testParentLeaseBoundsRequestedTools() {
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    actualPlan: { ...plan, requestedTools: [] } }).reason,
  'morphogenesis_operation_not_requested');
  assert.equal(admitMorphogenesisStrategy({ ...gates,
    actualPlan: { ...plan, requestedTools: ['genos_change_organization', 'genos_extra_tool'] } }).reason,
  'requested_tools_exceed_parent_lease');
}

function testRegistrationMaturityAndTypedValidationAreMandatory() {
  const untyped = policyWith(candidateWith({ validation: { valid: false } }));
  assert.equal(admitMorphogenesisStrategy({ ...gates, policy: untyped }).reason,
    'typed_topology_validation_missing');
  const vetoed = policyWith(candidateWith({ admissibility: 'rejected' }));
  assert.equal(admitMorphogenesisStrategy({ ...gates, policy: vetoed }).reason,
    'candidate_has_capability_veto');
  const unknown = policyWith(candidateWith({ id: 'topology:no_such_topology:default',
    candidateId: 'topology:no_such_topology:default', topology: 'no_such_topology' }));
  assert.equal(admitMorphogenesisStrategy({ ...gates, policy: unknown }).reason,
    'topology_not_registered');
  const unknownVariant = policyWith(candidateWith({ id: 'topology:a_team:no_such_variant',
    candidateId: 'topology:a_team:no_such_variant', kind: 'VARIANT', variant: 'no_such_variant' }));
  assert.equal(admitMorphogenesisStrategy({ ...gates, policy: unknownVariant }).reason,
    'variant_not_registered');
  const immatureRegistry = { get: () => ({ requiredCapabilities: [] }),
    variants: { listEntries: () => [{ variantId: 'default', maturity: 'experimental', requiredCapabilities: [] }] },
    list: () => ['a_team'] };
  assert.equal(admitMorphogenesisStrategy({ ...gates, registry: immatureRegistry }).reason,
    'variant_not_mature');
}

function testPolicyProposalMustMatchConcretePlanGraph() {
  const different = { ...plan, selectedTopology: 'rhizome',
    morphologyPatch: { graph: compileExpression(topologyExpression('rhizome'),
      { mission: 'mission', missionId: 'mission-2', globalBudget: { tokens: 50 } }) } };
  const result = admitMorphogenesisStrategy({ ...gates, actualPlan: different });
  assert.equal(result.reason, 'actual_plan_recipe_mismatch');
}

function testConcretePlanGraphMustMatchRecipe() {
  const foreignGraph = { ...plan,
    morphologyPatch: { graph: compileExpression(topologyExpression('rhizome'),
      { mission: 'mission', missionId: 'mission-9', globalBudget: { tokens: 50 } }) } };
  assert.equal(admitMorphogenesisStrategy({ ...gates, actualPlan: foreignGraph }).reason,
    'actual_plan_graph_mismatch');
  const composite = { ...plan,
    morphologyPatch: { graph: compileExpression(nestExpression(topologyExpression('a_team'), topologyExpression('a_team')),
      { mission: 'mission', missionId: 'mission-composite', globalBudget: { tokens: 50 } }) } };
  assert.equal(admitMorphogenesisStrategy({ ...gates, actualPlan: composite }).reason,
    'actual_plan_graph_mismatch');
}

function testVariantOperationDerivesStrategyLease() {
  const variantCandidate = candidateWith({ id: 'topology:a_team:pipeline',
    candidateId: 'topology:a_team:pipeline', kind: 'VARIANT', variant: 'pipeline' });
  const variantPlan = { ...plan, selectedVariant: 'pipeline',
    morphologyPatch: { graph: compileExpression(topologyExpression('a_team', 'pipeline'),
      { mission: 'mission', missionId: 'mission-pipeline', globalBudget: { tokens: 50 } }) },
    requestedTools: ['genos_change_strategy'] };
  const variantGates = { ...gates, policy: policyWith(variantCandidate), actualPlan: variantPlan,
    parentLease: { allowedTools: ['genos_change_strategy'] } };
  const admitted = admitMorphogenesisStrategy(variantGates);
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.recipe.variant, 'pipeline');
  assert.equal(admitMorphogenesisStrategy({ ...variantGates,
    parentLease: { allowedTools: ['genos_change_organization'] } }).reason,
  'morphogenesis_lease_missing');
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

function testPlannerTransitionRejectsUntypedCompositeGraphs() {
  const graph = compileExpression(nestExpression(topologyExpression('a_team'), topologyExpression('rhizome')),
    { mission: 'mission', missionId: 'mission-composite', globalBudget: { tokens: 50 } });
  const composite = { ...plannerPlan, morphologyPatch: { graph } };
  assert.equal(admitPlannerTransition({ ...gates, policy: plannerPolicy,
    actualPlan: composite }).reason, 'typed_topology_validation_missing');
}

function compositePlannerGates(assignments, allocated) {
  const bioRequired = registry.get('biocenose').requiredCapabilities;
  const holoRequired = registry.get('holobionte').requiredCapabilities;
  const union = [...new Set([...bioRequired, ...holoRequired])];
  const graph = compileExpression(nestExpression(topologyExpression('biocenose'), topologyExpression('holobionte')),
    { mission: 'mission', missionId: 'mission-composite', globalBudget: { tokens: 50 } });
  return { ...gates, policy: plannerPolicy,
    actualPlan: { selectedTopology: 'biocenose', selectedVariant: 'default',
      morphologyPatch: { graph }, workerAssignments: assignments,
      allocatedTokens: allocated, requestedTools: ['genos_change_organization'] },
    topologyCapabilities: union };
}

function testPlannerCompositeRequiresExplicitPerLeafAttribution() {
  const bioRequired = registry.get('biocenose').requiredCapabilities;
  const holoRequired = registry.get('holobionte').requiredCapabilities;
  const union = [...new Set([...bioRequired, ...holoRequired])];
  const unattributed = [{ workerKind: 'analyst', capabilities: union, tokenBudget: 50 }];
  assert.equal(admitPlannerTransition(compositePlannerGates(unattributed, 50)).reason,
    'topology_has_no_worker_assignment');
  const perLeaf = [
    { workerKind: 'analyst', capabilities: bioRequired, tokenBudget: 25, morphologyTopology: 'biocenose' },
    { workerKind: 'analyst', capabilities: holoRequired, tokenBudget: 25, morphologyTopology: 'holobionte' }];
  const admitted = admitPlannerTransition(compositePlannerGates(perLeaf, 50));
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.selectionBasis, 'planner_heuristic_unvalidated');
}

function testPlannerTransitionRejectsImmatureLeaf() {
  const graph = { graphId: 'graph-immature', nodes: [{ kind: 'TOPOLOGY', nodeId: 'node_1',
    topology: 'no_such_topology', variant: 'default' }], edges: [] };
  const actualPlan = { ...plannerPlan, selectedTopology: 'no_such_topology', morphologyPatch: { graph } };
  assert.equal(admitPlannerTransition({ ...gates, policy: plannerPolicy, actualPlan }).reason,
    'planner_transition_topology_not_mature');
}

testAdmittedRecipeBindsTheActualPlan();
testMissingAuthorityOrFreshQuiescenceFailsClosed();
testQuiescenceRequiresFreshConfirmedBoundary();
testBudgetCapabilitiesAndPolicyProposalAreMandatory();
testBudgetCoherenceIsMandatory();
testWorkerAssignmentsAndKindsAreMandatory();
testParentLeaseBoundsRequestedTools();
testRegistrationMaturityAndTypedValidationAreMandatory();
testPolicyProposalMustMatchConcretePlanGraph();
testConcretePlanGraphMustMatchRecipe();
testVariantOperationDerivesStrategyLease();
testPlannerHeuristicTransitionIsAdmittedWithExplicitBasis();
testPlannerTransitionRejectsGraphMismatch();
testPlannerTransitionRejectsUntypedCompositeGraphs();
testPlannerCompositeRequiresExplicitPerLeafAttribution();
testPlannerTransitionRejectsImmatureLeaf();
console.log('Morphogenesis strategy admission tests passed.');
