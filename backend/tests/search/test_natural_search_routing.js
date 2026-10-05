const assert = require('node:assert/strict');
const { openFixture, send, runtime } = require('./naturalSearchTestFixture');

async function plasticitySchema(db, state) {
  const before = state.actuator.searchGenome.genome.topology;
  const receipt = await state.actuator.plasticity({ agentId: 'source' });
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.result.scope, 'search-genome');
  assert.notEqual(state.actuator.searchGenome.genome.topology, before);
  await runtime.flushSearchState('source');
  const saved = await state.persistence.loadRuntimeCheckpoint('source');
  assert.equal(saved.modules.genome.genome.topology, state.actuator.searchGenome.genome.topology);
}

async function selectedProcesses(db) {
  const state = await runtime.getOrCreateSearchState('source', db);
  await plasticitySchema(db, state);
  for (let i = 0; i < 30; i++) await send(db, {});
  assert.ok(state.actuator.getReceipts().some(r => r.process === 'CLONAL_AFFINITY_SEARCH'));
  assert.ok(state.ledger.hypothesesForAgent('source').some(h => h.statement.includes('proactive')));
  assert.ok(state.actuator.modules.affinityVariants.length);
  for (let i = 0; i < 8; i++) await send(db, { budgetRatio: 0.99 });
  const mutation = state.actuator.getReceipts().findLast(r => r.process === 'STRESS_HYPERMUTATION');
  assert.equal(mutation.status, 'success');
  assert.equal(mutation.result.radius, state.controller.pressureModel.recommendedRadius);
  for (let i = 0; i < 3; i++) {
    await send(db, { type: 'HYPOTHESIS_PROPOSED', budgetRatio: 0.99,
      payload: { hypothesisId: `failed-${i}`, statement: `failed family ${i}` } });
    await send(db, { type: 'HYPOTHESIS_FALSIFIED', budgetRatio: 0.99, payload: { hypothesisId: `failed-${i}` } });
  }
  for (let i = 0; i < 6; i++) await send(db, { budgetRatio: 0.99 });
  assert.ok(state.actuator.getReceipts().some(r => r.process === 'SPECIATION'));
  assert.equal((await db.get('SELECT count(*) AS n FROM search_niches WHERE agent_id=?', 'source')).n, 3);
  for (let i = 0; i < 10; i++) await send(db, { type: 'TOOL_RESULT',
    payload: { evidenceGain: 1, tokensConsumed: 10, costConsumed: 0.001 } });
  assert.ok(state.actuator.getReceipts().some(r => r.process === 'EVOLUTION'));
  assert.notEqual(state.controller.lastProcess, 'EVOLUTION', 'Evolution must have an exit');
  const memory = state.actuator.modules.negativeMemory;
  for (const trail of memory.trails.values()) trail.createdAt = 0;
  await send(db, { type: 'TOOL_RESULT', payload: { evidenceGain: 1, tokensConsumed: 10 } });
  assert.equal(memory.trails.size, 0, 'Expired failures must not be recreated on unrelated events');
  return state;
}

async function lifecycleAndIdentity(db, state) {
  for (const type of ['HYPOTHESIS_PROPOSED', 'HYPOTHESIS_TEST_STARTED', 'HYPOTHESIS_PROGRESS',
    'HYPOTHESIS_FALSIFIED', 'HYPOTHESIS_SUSPENDED']) {
    assert.equal(runtime.shouldProcessNaturalSearchEvent({ eventType: type.toLowerCase() }), true);
  }
  await send(db, { type: 'HYPOTHESIS_PROPOSED', payload: { hypothesisId: 'owned', statement: 'cache check' } });
  await send(db, { type: 'HYPOTHESIS_TEST_STARTED', payload: { hypothesisId: 'owned' } });
  await send(db, { type: 'HYPOTHESIS_PROGRESS', payload: { hypothesisId: 'owned' } });
  const h = state.ledger.hypotheses.get('owned');
  assert.ok(h.lastProgressAt);
  await assert.rejects(state.persistence.saveHypothesis({ ...h, agentId: 'receiver' }), /another agent/);
  await send(db, { type: 'HYPOTHESIS_SUSPENDED', payload: { hypothesisId: 'owned' } });
  assert.equal(h.status, 'suspended');
  await send(db, { type: 'TOOL_RESULT', payload: { hypothesisId: 'owned', evidenceGain: 1, evidenceRef: 'observed-run' } });
  assert.equal(state.stepCount - state.lastProgressStep, 0);
}

async function main() {
  const db = await openFixture(':memory:');
  try { const state = await selectedProcesses(db); await lifecycleAndIdentity(db, state); }
  finally { await runtime.clearSearchState('source'); await db.close(); }
}
main().then(() => console.log('Natural Search actual process selection, lifecycle, expiry and ownership passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
