'use strict';

const assert = require('node:assert/strict');
const { withTransaction } = require('../src/db');
const fixture = require('./helpers/missionProtocolFixture');
const continuity = require('../src/services/missionProtocols/continuity');
const store = require('../src/services/missionProtocols/continuityStore');

async function successor(ctx) {
  ctx.executionRun = await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: ctx.agentId, contractRecord: ctx.contractRecord, missionId: ctx.normalizedMission.missionId,
    budget: ctx.executionRun.budget });
  return fixture.seal(ctx);
}

async function effect(binding, tokens) {
  const event = { eventType: 'AGENT_THINKING', payload: { executionRunId: binding.runId, tokens } };
  return withTransaction(binding.db, async () => {
    await continuity.beforeEffect(binding, event);
    await binding.db.run('UPDATE strategy_execution_runs SET metrics_json=? WHERE id=?', JSON.stringify({ tokens }), binding.runId);
  });
}

async function parallelWorker(ctx, first) {
  const other = { ...ctx, agentId: 'worker-two', normalizedMission: { ...ctx.normalizedMission, agentId: 'worker-two' } };
  other.contractRecord = await require('./helpers/biologicalWorkerFixture').addWorker(ctx.db, { agentId: 'worker-two' });
  other.executionRun = await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: other.agentId, contractRecord: other.contractRecord, missionId: other.normalizedMission.missionId,
    budget: first.executionRun.budget });
  const binding = await fixture.seal(other);
  assert.equal((await continuity.initialize(binding)).generation, 1);
  await effect(first, 2);
  await effect(binding, 4);
  assert.equal((await continuity.beforeExecution(first)).runId, first.runId,
    'two real workers in the same mission/workspace do not transfer each other authority');
}

async function main() {
  const ctx = await fixture.create();
  try {
    const first = await fixture.seal(ctx);
    const initial = await continuity.initialize(first);
    assert.equal(initial.generation, 1);
    await parallelWorker(ctx, first);
    await effect(first, 3);
    const second = await successor(ctx);
    const activated = await continuity.initialize(second);
    assert.equal(activated.generation, 2);
    assert.ok(activated.transferId);
    assert.deepEqual(await continuity.initialize(second), activated);
    await assert.rejects(effect(first, 99), /STALE_INCARNATION/);
    const old = await ctx.db.get('SELECT metrics_json FROM strategy_execution_runs WHERE id=?', first.runId);
    assert.equal(JSON.parse(old.metrics_json).tokens, 3, 'stale incarnation cannot modify actual run metrics');
    await effect(second, 4);
    const third = await successor(ctx);
    await assert.rejects(withTransaction(ctx.db, async () => {
      await continuity.initialize(third);
      throw new Error('simulate main DB commit interruption after authority transfer');
    }), /commit interruption/);
    assert.equal((await store.read(third)).runId, second.runId);
    await assert.rejects(effect(second, 77), /STALE_INCARNATION/);
    assert.equal((await continuity.initialize(third)).generation, 3,
      'durable handoff/fence recovers after main DB transaction rollback without duplicate generation');
    await effect(third, 5);
    await assert.rejects(continuity.beforeEffect(third, { payload: { executionRunId: second.runId } }), /EVENT_RUN_MISMATCH/);
    await assert.rejects(continuity.initialize({ ...third, preparing: true }), /SEALED_AUTHORITY_REQUIRED/);
    await assert.rejects(continuity.beforeExecution({ ...third, scope: { ...third.scope, projectId: 'foreign' } }), /TENANT_CHANGED/);
    console.log('Mission CONTINUITY actual SQL effects, monotone succession, stale generation and interrupted-commit recovery: PASS');
  } finally { await ctx.close(); }
}

module.exports = { successor, effect };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
