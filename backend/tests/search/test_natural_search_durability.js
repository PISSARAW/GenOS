'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { openFixture, send, runtime } = require('./naturalSearchTestFixture');
const { captureCheckpoint } = require('../../src/services/search/searchRuntimeCheckpoint');

async function exerciseModules(db) {
  const state = await send(db, { type: 'HYPOTHESIS_PROPOSED', payload: { hypothesisId: 'hyp', statement: 'cache variant' } });
  assert.ok(state.actuator.searchGenome.genome.exploration);
  assert.strictEqual(state.actuator.searchGenome, state.actuator.modules.searchGenome);
  assert.strictEqual(state.integration.negativeMemory, state.actuator.modules.negativeMemory);
  assert.equal((await state.actuator.clonalAffinity({ agentId: 'source' })).status, 'success');
  assert.equal((await state.actuator.hypermutation({ agentId: 'source', radius: 'radical' })).result.radius, 'radical');
  const mutated = state.actuator.searchGenome.genome;
  assert.equal(mutated.mutations.at(-1).changes.length, 6);
  assert.equal((await state.actuator.forage({ agentId: 'source', infoGain: 0.42 })).result.infoGain, 0.42);
  assert.equal((await state.actuator.evolution({ agentId: 'source', successfulFamilies: ['cache'] })).result.generations, 1);
  assert.equal((await state.actuator.speciation({ agentId: 'source' })).result.nichesCreated, 3);
  assert.equal((await state.actuator.plasticity({ agentId: 'source', topology: 'isolated' })).status, 'success');
  await send(db, { type: 'TOOL_RESULT', payload: { hypothesisId: 'hyp', evidenceGain: 1, evidenceRef: 'run-a' } });
  const proof = [...state.ledger.proofs.values()].at(-1);
  await state.persistence.saveHypothesis(state.ledger.hypotheses.get('hyp'));
  assert.ok(await state.persistence.db.get('SELECT id FROM search_proofs WHERE id=?', proof.id));
  await send(db, { type: 'HYPOTHESIS_FALSIFIED', payload: { hypothesisId: 'hyp' } });
  assert.equal(state.ledger.hypotheses.get('hyp').status, 'falsified');
  assert.equal(state.integration.isPathBlocked('source', 'cache variant'), true);
  const count = state.integration.getNegativeTrails('source').length;
  await send(db, {});
  assert.equal(state.integration.getNegativeTrails('source').length, count);
  const replay = await state.actuator.replayCausal({ agentId: 'source', events: state.causalEvents });
  assert.equal(replay.action, 'REPLAY_ANALYZED');
  assert.equal(replay.result.stateRestored, false);
  const skipped = await state.actuator.replayCausal({ agentId: 'source', events: [] });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.result.restorePoint, null);
  await runtime.flushSearchState('source');
  return captureCheckpoint(state);
}

async function assertReopened(db, expected) {
  const restored = await runtime.getOrCreateSearchState('source', db);
  const actual = captureCheckpoint(restored);
  assert.deepEqual(actual, expected);
  assert.strictEqual(restored.integration.negativeMemory, restored.actuator.modules.negativeMemory);
  assert.equal(restored.integration.isPathBlocked('source', 'cache variant'), true);
  const { HypothesisLedger } = require('../../src/services/search/hypothesisLedgerService');
  const ledger = new HypothesisLedger().load(expected.ledger);
  const { NaturalSearchController } = require('../../src/services/search/naturalSearchController');
  const reference = new NaturalSearchController({ ledger });
  Object.assign(reference.pressureModel, expected.control.pressureModel);
  reference.lastProcess = expected.control.lastProcess;
  reference.stepsSinceChange = expected.control.stepsSinceChange;
  reference.stepsInCurrentProcess = expected.control.stepsInCurrentProcess;
  const ctx = { agentId: 'source', searchYield: 0, stepsSinceProgress: 8, falsifiedHypotheses: 1,
    budgetRatio: 0.3, causalProgressReport: restored.causalProgress.report(), entropyMetrics: { normalizedEntropy: 0.5 } };
  assert.deepEqual(restored.controller.selectProcess(ctx), reference.selectProcess(ctx));
}

async function concurrency(db) {
  const [a, b] = await Promise.all([
    runtime.getOrCreateSearchState('concurrent', db), runtime.getOrCreateSearchState('concurrent', db)
  ]);
  assert.strictEqual(a, b);
  await Promise.all(Array.from({ length: 12 }, () => send(db, { agentId: 'concurrent' })));
  assert.equal(a.stepCount, 12);
  assert.equal((await a.persistence.loadRuntimeCheckpoint('concurrent')).stepCount, 12);
}

async function persistenceFailure(db) {
  const state = await runtime.getOrCreateSearchState('source', db);
  const original = state.persistence.saveRuntimeCheckpoint;
  const committed = await state.persistence.loadRuntimeCheckpoint('source');
  state.stepCount++;
  state.persistence.saveRuntimeCheckpoint = async () => { throw new Error('injected write failure'); };
  await assert.rejects(runtime.clearSearchState('source'), /injected write failure/);
  assert.strictEqual(await runtime.getOrCreateSearchState('source', db), state);
  assert.deepEqual(await state.persistence.loadRuntimeCheckpoint('source'), committed);
  const stop = await runtime.checkNaturalSearchControl({ db, agentId: 'source' }, { eventType: 'AGENT_STEP', payload: {} });
  assert.equal(stop, true);
  state.persistence.saveRuntimeCheckpoint = original;
}

async function main() {
  const filename = path.join(os.tmpdir(), `ns-durability-${randomUUID()}.db`);
  let db = await openFixture(filename);
  try {
    const expected = await exerciseModules(db);
    await runtime.clearSearchState('source');
    await db.close();
    db = await openFixture(filename);
    await assertReopened(db, expected);
    await concurrency(db);
    await persistenceFailure(db);
  } finally {
    for (const agent of ['source', 'receiver', 'concurrent']) await runtime.clearSearchState(agent);
    await db.close();
    fs.rmSync(filename, { force: true });
  }
}

main().then(() => console.log('Natural Search runtime modules, reopen, concurrency and write failure passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
