'use strict';

const assert = require('node:assert/strict');
const morphogenesis = require('../src/services/morphogenesis/morphogenesisPlannerService');
const { validateMorphologyGraph } = require('../src/services/morphogenesis/graph/morphologyGraphValidator');
const { checkResources } = require('../src/services/morphogenesis/typing/resourceCompatibility');

function plan(rhizomeBranch, budget = {}) {
  return morphogenesis.planMorphogenesis({
    missionId: 'rhizome-ablation',
    mission: 'Explore an uncertain problem, then return verified findings.',
    currentState: { topology: 'a_team', agents: new Map() },
    proposedTopology: 'a_team',
    budget,
    rhizomeBranch
  });
}

function verifyWithRhizome() {
  const result = plan(true, { growth: 3, tokens: 900 });
  const branch = result.morphologyPatch.graph.nodes.find((node) => node.topology === 'rhizome');
  assert.ok(branch, 'enabled Rhizome becomes a child of the Morphogenesis graph');
  assert.equal(branch.parentNodeId, result.morphologyPatch.graph.rootNodeId);
  assert.equal(branch.budget.growth, 3);
  assert.equal(branch.evidencePolicy.promotion, 'verified-only');
  assert.equal(validateMorphologyGraph(result.morphologyPatch.graph).valid, true);
  assert.deepEqual(checkResources(result.morphologyPatch.graph), []);
}

function verifyWithoutRhizome() {
  const result = plan(false, { tokens: 900 });
  assert.equal(result.selectedTopology, 'a_team');
  assert.equal(result.morphologyPatch.graph.nodes.some((node) => node.topology === 'rhizome'), false);
}

function verifyBudgetGate() {
  assert.throws(() => plan(true, { tokens: 900 }), {
    code: 'MORPHOGENESIS_RHIZOME_GROWTH_BUDGET_REQUIRED'
  });
}

verifyWithRhizome();
verifyWithoutRhizome();
verifyBudgetGate();
console.log('Morphogenesis Rhizome branch and ablation: passed');
