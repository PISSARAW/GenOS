const assert = require('node:assert/strict');
const organizationAlgorithms = require('../src/services/organizationAlgorithms');
const swarmAlgorithms = require('../src/services/swarmTopologyAlgorithms');

const ORGANIZATIONS = [
  'specialist_expert_committee', 'blind_adversarial_review', 'red_blue_coevolution',
  'brier_weighted_consensus', 'quorum_with_abstention', 'stigmergy', 'energy_huddle',
  'flocking_boids', 'fish_school_search', 'slime_mould_network', 'grey_wolf_optimizer',
  'network_silence', 'strategy_arena', 'competitive_arena', 'hierarchical_merge',
  'isolated_recovery', 'memory_compilation', 'dynamic_polyethism', 'mycelial_routing'
];

const state = {
  orchestratorId: 'orch',
  agents: [
    { id: 'a', role: 'red_team', fitness: 1, capabilities: ['web'], x: 0, y: 0, heading: 0 },
    { id: 'b', role: 'blue_team', fitness: 3, capabilities: ['data'], x: 1, y: 1, heading: 0 }
  ],
  votes: [{ support: true, weight: 2 }, { abstain: true }],
  populations: [{ id: 'p1', weight: 3 }, { id: 'p2', weight: 1 }],
  budget: 100,
  facts: ['f1'],
  lostRoles: ['observer'],
  dossiers: [{ events: [{ evidenceReport: { outcome: 'success', confidence: 0.9 } }] }],
  need: 'web',
  pack: [
    { id: 'w1', fitness: 5, x: 0, y: 0 },
    { id: 'w2', fitness: 3, x: 1, y: 1 }
  ],
  edges: [
    { id: 'e1', flow: 1, conductivity: 0.5 },
    { id: 'e2', flow: 0, conductivity: 0.3 }
  ]
};

for (const organization of ORGANIZATIONS) {
  const step = organizationAlgorithms.runOrganizationStep(organization, state);
  assert.ok(step && step.organization === organization, `missing algorithm for ${organization}`);
}

const flocking = organizationAlgorithms.runOrganizationStep('flocking_boids', state);
assert.ok(flocking && flocking.organization === 'flocking_boids' && Array.isArray(flocking.agents));
assert.equal(flocking.agents.length, 2);

const fish = organizationAlgorithms.runOrganizationStep('fish_school_search', state);
assert.ok(fish && fish.organization === 'fish_school_search' && Array.isArray(fish.individuals));
assert.equal(fish.individuals.length, 2);

const slime = organizationAlgorithms.runOrganizationStep('slime_mould_network', state);
assert.ok(slime && slime.organization === 'slime_mould_network' && Array.isArray(slime.edges));

const wolf = organizationAlgorithms.runOrganizationStep('grey_wolf_optimizer', state);
assert.ok(wolf && wolf.organization === 'grey_wolf_optimizer' && Array.isArray(wolf.pack));
assert.equal(wolf.pack.length, 2);

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
