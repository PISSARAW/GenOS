const assert = require('node:assert/strict');
const algo = require('../src/services/swarmTopologyAlgorithms');
const runtime = require('../src/services/swarmTopologyRuntimeService');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');

const wolfStep = algo.runTopologyStep('grey_wolf_optimizer', { pack: [
  { id: 'w1', fitness: 1 },
  { id: 'w2', fitness: 9 },
  { id: 'w3', fitness: 5 }
] });
assert.deepEqual(algo.preferredAgents('grey_wolf_optimizer', wolfStep), ['w2', 'w3', 'w1']);

const fishStep = algo.runTopologyStep('fish_school_search', { agents: [
  { id: 'a', x: 0, y: 0, fitness: 1 },
  { id: 'b', x: 100, y: 0, fitness: 9 }
] });
assert.equal(algo.preferredAgents('fish_school_search', fishStep).length, 2);

const boidsStep = algo.runTopologyStep('flocking_boids', { agents: [{ id: 'solo', x: 0, y: 0, heading: 1 }] });
assert.deepEqual(algo.preferredAgents('flocking_boids', boidsStep), ['solo']);

assert.deepEqual(algo.preferredAgents('slime_mould_network', { edges: [] }), []);

(async () => {
  const fakeDb = { all: async () => [{ id: 'w1', role: 'r', status: 'completed' }] };
  const original = dynamicOrganization.getState;
  dynamicOrganization.getState = async () => ({ organization: 'grey_wolf_optimizer' });
  await runtime.applyStepForOrchestrator('orch-actuator', { db: fakeDb, state: { agents: [{ id: 'w1', x: 0, y: 0, fitness: 1 }], pack: [{ id: 'w1', x: 0, y: 0, fitness: 1 }] } });
  assert.deepEqual(runtime.preferredSurvivorsFor('orch-actuator'), ['w1']);
  assert.deepEqual(runtime.preferredSurvivorsFor('unknown'), []);
  dynamicOrganization.getState = original;
  console.log('Swarm actuator wiring checks: PASS');
})().catch((error) => {
  console.error('Swarm actuator test failed:', error);
  process.exit(1);
});
