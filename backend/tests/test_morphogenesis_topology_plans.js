'use strict';

const assert = require('node:assert/strict');
const { planMorphogenesis } = require('../src/services/morphogenesis/morphogenesisPlannerService');
const { ALL_IDS } = require('../src/services/morphogenesis/topologyResolverService');

function planFor(topology) {
  return planMorphogenesis({
    missionId: `topology-plan-${topology}`,
    currentState: { topology: 'a_team', agents: new Map() },
    proposedTopology: topology,
    budget: 5000,
    mission: `Verify the ${topology} morphology plan.`
  });
}

function rootNode(plan) {
  return plan.morphologyPatch.graph.nodes.find(
    (node) => node.nodeId === plan.morphologyPatch.graph.rootNodeId
  );
}

function verifyPlans() {
  for (const topology of ALL_IDS) {
    const plan = planFor(topology);
    assert.equal(plan.selectedTopology, topology);
    assert.equal(rootNode(plan).topology, topology);
    assert.equal(plan.morphologyPatch.operation, 'replace_root');
    assert.ok(plan.rollbackPlan);
  }
}

verifyPlans();
console.log('Morphogenesis topology plan checks: PASS');
