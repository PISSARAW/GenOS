const assert = require('node:assert/strict');
const organizationAlgorithms = require('../src/services/organizationAlgorithms');
const swarmAlgorithms = require('../src/services/swarmTopologyAlgorithms');

const ORGANIZATIONS = [
  'specialist_expert_committee', 'blind_adversarial_review', 'red_blue_coevolution',
  'brier_weighted_consensus', 'quorum_with_abstention', 'stigmergy', 'energy_huddle',
  'network_silence', 'strategy_arena', 'competitive_arena', 'hierarchical_merge',
  'isolated_recovery', 'memory_compilation', 'dynamic_polyethism', 'mycelial_routing'
];

const state = {
  orchestratorId: 'orch',
  agents: [
    { id: 'a', role: 'red_team', fitness: 1, capabilities: ['web'] },
    { id: 'b', role: 'blue_team', fitness: 3, capabilities: ['data'] }
  ],
  votes: [{ support: true, weight: 2 }, { abstain: true }],
  populations: [{ id: 'p1', weight: 3 }, { id: 'p2', weight: 1 }],
  budget: 100,
  facts: ['f1'],
  lostRoles: ['observer'],
  dossiers: [{ events: [{ evidenceReport: { outcome: 'success', confidence: 0.9 } }] }],
  need: 'web'
};

for (const organization of ORGANIZATIONS) {
  const step = organizationAlgorithms.runOrganizationStep(organization, state);
  assert.ok(step && step.organization === organization, `missing algorithm for ${organization}`);
}

assert.equal(organizationAlgorithms.runOrganizationStep('flocking_boids', state), null);
assert.equal(organizationAlgorithms.runOrganizationStep('unknown_org', state), null);
assert.deepEqual(organizationAlgorithms.runOrganizationStep('specialist_expert_committee', state).spokes, ['a', 'b']);
assert.equal(organizationAlgorithms.runOrganizationStep('blind_adversarial_review', state).pairs.length, 1);
assert.equal(organizationAlgorithms.runOrganizationStep('red_blue_coevolution', state).red[0], 'a');
assert.equal(organizationAlgorithms.runOrganizationStep('hierarchical_merge', state).root, 'a');
assert.equal(organizationAlgorithms.runOrganizationStep('dynamic_polyethism', state).roleGradient[0].id, 'b');
assert.equal(organizationAlgorithms.runOrganizationStep('mycelial_routing', state).route, 'a');
assert.equal(organizationAlgorithms.runOrganizationStep('energy_huddle', state).allocations[0].budget, 75);
assert.equal(organizationAlgorithms.runOrganizationStep('quorum_with_abstention', state).reached, true);

assert.equal(organizationAlgorithms.authorityFor('grey_wolf_optimizer', 'alpha'), 'leader');
assert.equal(organizationAlgorithms.authorityFor('grey_wolf_optimizer', 'omega'), 'follower');
assert.equal(organizationAlgorithms.authorityFor('specialist_expert_committee', 'orchestrator'), 'hub');
assert.equal(organizationAlgorithms.authorityFor('unknown', 'x'), 'member');

const delegated = swarmAlgorithms.runTopologyStep('specialist_expert_committee', state);
assert.equal(delegated.organization, 'specialist_expert_committee');
assert.deepEqual(delegated.spokes, ['a', 'b']);
assert.deepEqual(swarmAlgorithms.runTopologyStep('unknown_org', state), null);

console.log('Organization algorithms checks: PASS');
