'use strict';

const assert = require('node:assert/strict');
const resolver = require('../src/services/morphogenesis/organizationResolverService');
const planner = require('../src/services/morphogenesis/morphogenesisPlannerService');
const { buildTransitionPlan } = require('../src/services/morphogenesis/dynamicReevaluationExecutorService');
const organizations = require('../src/services/organizationAlgorithms');

const EXPECTED = [
  'specialist_expert_committee', 'blind_adversarial_review', 'red_blue_coevolution',
  'brier_weighted_consensus', 'quorum_with_abstention', 'stigmergy', 'flocking_boids',
  'fish_school_search', 'slime_mould_network', 'grey_wolf_optimizer', 'mycelial_routing',
  'dynamic_polyethism', 'energy_huddle', 'network_silence', 'strategy_arena',
  'hierarchical_merge', 'competitive_arena', 'isolated_recovery', 'memory_compilation'
];

function verifyCompleteRanking() {
  assert.deepEqual(resolver.ORGANIZATION_IDS, EXPECTED);
  const decision = resolver.resolveOrganization({ selectedTopology: 'biocenose',
    problemProfile: { domain: 'security', adversarial_risk: 1, risk: 0.8, uncertainty: 0.7 } });
  assert.equal(decision.organization, 'red_blue_coevolution');
  assert.equal(decision.rankings.length, 19);
  assert.deepEqual(new Set(decision.rankings.map((item) => item.organization)), new Set(EXPECTED));
}

function verifyPressureSpecialization() {
  assert.equal(resolver.resolveOrganization({ selectedTopology: 'holobionte',
    problemProfile: { recovery_need: 1, risk: 0.9 } }).organization, 'isolated_recovery');
  assert.equal(resolver.resolveOrganization({ selectedTopology: 'syncytium',
    problemProfile: { memory_pressure: 1 } }).organization, 'memory_compilation');
  assert.equal(resolver.resolveOrganization({ selectedTopology: 'syncytium',
    problemProfile: { communication_redundancy: 1, budget_pressure: 0.7 } }).organization, 'network_silence');
}

function verifyPlannerBinding() {
  const plan = planner.planMorphogenesis({
    missionId: 'organization-ranking', currentState: { topology: 'a_team', agents: new Map() },
    problemProfile: { domain: 'security', adversarial_risk: 1, risk: 0.8 },
    budget: { tokens: 8000 }
  });
  assert.equal(plan.selectedOrganization, 'red_blue_coevolution');
  assert.equal(plan.candidateOrganizations.length, 19);
  assert.equal(plan.controlReceipt.organization.selectedBy, 'ranked');
  const root = plan.morphologyPatch.graph.nodes.find((node) =>
    node.nodeId === plan.morphologyPatch.graph.rootNodeId);
  assert.equal(root.organization, 'red_blue_coevolution');
  assert.ok(plan.capabilityChanges.some((change) => change.capability === 'IMMUNE_SYSTEM'));
  assert.ok(plan.topologyChanges.some((change) => change.field === 'organization'
    && change.to === 'red_blue_coevolution'));
}

function verifyExplicitOverrideAndTransition() {
  const plan = planner.planMorphogenesis({
    missionId: 'organization-explicit', currentState: { topology: 'a_team', agents: new Map() },
    proposedTopology: 'network_silence',
    problemProfile: { domain: 'security', adversarial_risk: 1 }, budget: { tokens: 4000 }
  });
  assert.equal(plan.selectedOrganization, 'network_silence');
  assert.equal(plan.controlReceipt.organization.selectedBy, 'explicit');
  const transition = buildTransitionPlan(plan);
  assert.equal(transition.targetTopology, plan.selectedTopology);
  assert.equal(transition.targetOrganization, 'network_silence');
}

function verifyDistinctArenas() {
  const agents = [{ id: 'low', evidenceScore: 0.2 }, { id: 'high', evidenceScore: 0.9 }];
  const strategy = organizations.runOrganizationStep('strategy_arena', { agents });
  const competitive = organizations.runOrganizationStep('competitive_arena', { agents });
  assert.equal(strategy.selectionRule, 'pareto_then_promotion');
  assert.equal(competitive.selectionRule, 'evidence_weighted_ranking');
  assert.deepEqual(competitive.competitors, ['high', 'low']);
}

verifyCompleteRanking();
verifyPressureSpecialization();
verifyPlannerBinding();
verifyExplicitOverrideAndTransition();
verifyDistinctArenas();
console.log('Morphogenesis organization resolver: 19 organizations ranked and bound');
