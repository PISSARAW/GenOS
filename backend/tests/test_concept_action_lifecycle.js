'use strict';

const assert = require('node:assert/strict');
const { createDb } = require('./conceptSqliteFixture');
const lifecycle = require('../src/services/conceptActionLifecycleService');
const efference = require('../src/services/efferenceCopyService');
const runtime = require('../src/services/conceptRuntimeService');
const world = require('../src/services/worldModelGenerativeService');

async function act(db, actionId) {
  await efference.predict(db, 'a', { action: 'mcp:consolidate', actionId,
    expectedTypes: ['WORKFLOW_MCP_TOOL_COMPLETED'] });
  const token = await lifecycle.begin({ db, agentId: 'a', actionId, toolName: 'consolidate' });
  assert.equal(token.status, 'pending');
  await db.run('UPDATE episodic_memories SET is_consolidated = 1 WHERE rowid <= 25');
  const receipt = await lifecycle.complete(token, { result: { success: true, configured: true }, event: { id: actionId } });
  assert.equal((await lifecycle.complete(token, { result: { success: true } })).status, 'not_run');
  return receipt;
}

function verifyCold(receipt) {
  assert.equal(receipt.status, 'observed');
  assert.equal(receipt.before.state.memoryPressure, 0.1);
  assert.equal(receipt.after.state.memoryPressure, 0.05);
  assert.ok(Math.abs(receipt.valence.actualValue - 0.05) < 1e-10);
  assert.equal(receipt.valence.predictionError, null);
  assert.equal(receipt.valence.predictionStatus, 'not_run');
  assert.equal(receipt.worldModel.sample.samples, 1);
  assert.equal(receipt.efference.matched, true);
  assert.equal(receipt.causalAttribution, 'not_established');
  assert.equal(receipt.promotionAllowed, false);
  assert.ok(Object.isFrozen(receipt.after.state));
  assert.equal(lifecycle.isObserved(structuredClone(receipt)), false);
  assert.equal(runtime.statuses({ actuation: receipt }).world_model, 'observed');
  assert.equal(runtime.statuses({ actuation: receipt }, 'b').world_model, 'not_run');
  assert.equal(runtime.statuses({ actuation: structuredClone(receipt) }).world_model, 'not_run');
}

async function negatives(db) {
  assert.equal((await lifecycle.begin({})).status, 'not_run');
  assert.equal((await lifecycle.complete({}, {})).status, 'not_run');
  const token = await lifecycle.begin({ db, agentId: 'a', actionId: 'denied', toolName: 'consolidate' });
  assert.equal((await lifecycle.complete(token, { result: { success: false, configured: false } })).status, 'not_run');
  assert.equal((await world.predictState(db, 'b', { action: 'mcp:consolidate' })), null);
  assert.equal(lifecycle.expectedState({ distribution: [{ p: 1 }] }, {}), null);
  const failedDb = { get: async () => { throw Object.assign(Error('private'), { code: 'SQLITE_BUSY' }); } };
  assert.deepEqual(await lifecycle.begin({ db: failedDb, agentId: 'a', actionId: 'x', toolName: 'x' }),
    { status: 'not_run', reason: 'SQLITE_BUSY' });
}

async function main() {
  const db = await createDb();
  try {
    verifyCold(await act(db, 'first'));
    await db.run('UPDATE episodic_memories SET is_consolidated = 0');
    const warm = await act(db, 'second');
    assert.equal(warm.status, 'observed', JSON.stringify(warm));
    assert.equal(warm.valence.predictionError, 0);
    assert.equal(warm.worldModel.predictionSamples, 1);
    assert.equal(warm.worldModel.sample.samples, 2);
    await negatives(db);
    console.log('Actual SQLite action measurements, cold/warm prediction, correlation and forgery rejection passed.');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
