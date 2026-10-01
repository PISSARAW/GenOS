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

  const budgetedDb = { all: async () => [
    { id: 'w1', role: 'a', status: 'completed', cognitive_budget: 40 },
    { id: 'w2', role: 'b', status: 'running', cognitive_budget: 60 },
    { id: 'w3', role: 'c', status: 'idle' }
  ] };
  assert.equal((await runtime.stateFromOrchestrator(budgetedDb, 'orch')).budget, 100);
  const legacyDb = { all: async (sql) => {
    if (String(sql).includes('cognitive_budget')) throw new Error('no such column');
    return [{ id: 'w1', role: 'a', status: 'completed' }];
  } };
  assert.equal((await runtime.stateFromOrchestrator(legacyDb, 'orch')).budget, undefined);

  const original = dynamicOrganization.getState;
  dynamicOrganization.getState = async () => ({ organization: 'grey_wolf_optimizer' });
  const step = await runtime.applyStepForOrchestrator('orch', { db: fakeDb, state });
  assert.equal(step.organization, 'grey_wolf_optimizer');
  assert.equal(step.pack[0].role, 'alpha');
  assert.equal(step.pack[0].id, 'w1');
  const looped = await runtime.applyStepsForOrchestrator('orch', { db: fakeDb, state, steps: 3 });
  assert.equal(looped.step.organization, 'grey_wolf_optimizer');
  assert.equal(looped.stable, true);

  dynamicOrganization.getState = async () => ({ organization: 'unknown_org' });
  assert.equal(await runtime.applyStepForOrchestrator('orch', { db: fakeDb, state }), null);
  dynamicOrganization.getState = original;
  console.log('Swarm topology runtime checks: PASS');
})().catch((error) => {
  console.error('Swarm topology runtime test failed:', error);
  process.exit(1);
});
