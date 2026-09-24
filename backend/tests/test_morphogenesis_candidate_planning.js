'use strict';

const assert = require('node:assert/strict');
const { ALL_IDS } = require('../src/services/morphogenesis/topologyResolverService');
const ontology = require('../src/services/morphogenesis/morphogenesisOntology');
const planner = require('../src/services/morphogenesis/morphogenesisPlannerService');

function verifyCanonicalOntology() {
  assert.deepEqual(ALL_IDS, ['trinity', 'a_team', 'biome', 'biocenose', 'holobionte', 'syncytium', 'rhizome', 'metapopulation']);
  assert.equal(ontology.classifyMorphologyLabel('red_blue_coevolution').kind, 'organization');
  assert.equal(ontology.classifyMorphologyLabel('trinity').kind, 'topology');
}

function verifyFullCandidatePlans() {
  const plan = planner.planMorphogenesis({
    missionId: 'morphology-candidate-check',
    currentState: { topology: 'a_team', agents: new Map() },
    proposedTopology: 'red_blue_coevolution',
    problemProfile: { domain: 'security', adversarial_risk: 0.9, uncertainty: 0.8, hypotheses_count: 3 },
    budget: { tokens: 2000 }
  });
  assert.equal(plan.selectedOrganization, 'red_blue_coevolution');
  assert.ok(ALL_IDS.includes(plan.selectedTopology));
  assert.deepEqual(plan.candidateMorphologies.map((candidate) => candidate.topology), ALL_IDS);
  const root = plan.morphologyPatch.graph.nodes.find((node) => node.nodeId === plan.morphologyPatch.graph.rootNodeId);
  assert.equal(root.topology, plan.selectedTopology);
  assert.equal(root.organization, 'red_blue_coevolution');
}

function verifyExplicitSelectionAndMinimumPolicy() {
  const levels = ['primitive', 'procedure', 'direct_worker', 'resident_symbiont'];
  const lower = levels.map((level) => ({ id: level, level, available: false, reason: `${level} unavailable` }));
  const plan = planner.planMorphogenesis({
    missionId: 'morphology-minimum-check',
    currentState: { topology: 'a_team', agents: new Map() },
    proposedTopology: 'a_team',
    minimumMorphologyCandidates: [...lower, {
      id: 'trinity', topology: 'trinity', level: 'simple_topology', available: true,
      capabilities: [], blockedBy: [], profileFit: true
    }]
  });
  assert.equal(plan.selectedTopology, 'trinity');
  assert.equal(plan.minimumMorphologyDecision.status, 'minimum_admissible');
  assert.equal(plan.candidateMorphologies.length, 1);
}

verifyCanonicalOntology();
verifyFullCandidatePlans();
verifyExplicitSelectionAndMinimumPolicy();
console.log('Morphogenesis candidate planning: passed');
