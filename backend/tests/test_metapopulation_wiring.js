const assert = require('node:assert/strict');
const metapopulation = require('../src/services/metapopulationCoordinationService');

const composition = metapopulation.composeMetapopulation('Partition the mission into semi-independent populations with quorum and regeneration.');
assert.equal(composition.members.length, 4);
assert.equal(composition.organization, 'quorum_with_abstention');
assert.ok(composition.capabilityContract.required.includes('QUORUM'));
assert.ok(composition.capabilityContract.required.includes('SYNAPTIC_PLASTICITY'));
assert.ok(composition.capabilityContract.required.includes('RESILIENCE_RECOVERY'));
assert.deepEqual(composition.mechanisms, ['quorum_sensing', 'synaptic_plasticity', 'regeneration']);

const reached = metapopulation.senseQuorum([
  { agentId: 'a', evidenceScore: 0.9, weight: 2 },
  { agentId: 'b', evidenceScore: 0.7, weight: 1 },
  { agentId: 'c', evidenceScore: 0.2, weight: 1 }
]);
assert.equal(reached.reached, true);
assert.equal(reached.support, 0.75);

const notReached = metapopulation.senseQuorum([{ agentId: 'a', evidenceScore: 0.1 }], { quorumRatio: 0.5 });
assert.equal(notReached.reached, false);

const plan = metapopulation.regenerationPlan(['population_isolator', 'quorum_sensor', 'synaptic_adaptor'], { maxRespawn: 2 });
assert.deepEqual(plan.respawn, ['population_isolator', 'quorum_sensor']);
assert.equal(plan.degraded, true);
assert.ok(plan.sources.includes('lineage'));

const weighted = metapopulation.connectionWeights([{ id: 'a->b', weight: 0.5 }, { id: 'b->c', weight: 0.9 }], { 'a->b': 2, 'b->c': -5 });
assert.equal(weighted[0].weight, 0.7);
assert.equal(weighted[1].weight, 0.4);

assert.throws(() => metapopulation.composeMetapopulation(''), (error) => error.code === 'METAPOPULATION_MISSION_REQUIRED');
console.log('Metapopulation wiring checks: PASS');
