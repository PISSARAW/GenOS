const assert = require('node:assert/strict');
const runtime = require('../src/services/swarmTopologyRuntimeService');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');

const fakeDb = { all: async () => [
  { id: 'w1', role: 'a', status: 'completed' },
  { id: 'w2', role: 'b', status: 'running' },
  { id: 'w3', role: 'c', status: 'idle' }
] };

(async () => {
  const state = await runtime.stateFromOrchestrator(fakeDb, 'orch');
  assert.equal(state.agents.length, 3);
  assert.equal(state.pack[0].fitness, 1);
  assert.equal(state.pack[1].fitness, 0.5);
  assert.equal(state.pack[2].fitness, 0);
  assert.equal(state.edges.length, 2);

  const original = dynamicOrganization.getState;
  dynamicOrganization.getState = async () => ({ organization: 'grey_wolf_optimizer' });
  const step = await runtime.applyStepForOrchestrator('orch', { db: fakeDb, state });
  assert.equal(step.organization, 'grey_wolf_optimizer');
  assert.equal(step.pack[0].role, 'alpha');
  assert.equal(step.pack[0].id, 'w1');

  dynamicOrganization.getState = async () => ({ organization: 'specialist_expert_committee' });
  assert.equal(await runtime.applyStepForOrchestrator('orch', { db: fakeDb, state }), null);
  dynamicOrganization.getState = original;
  console.log('Swarm topology runtime checks: PASS');
})().catch((error) => {
  console.error('Swarm topology runtime test failed:', error);
  process.exit(1);
});
