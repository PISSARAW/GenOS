'use strict';

const assert = require('node:assert/strict');
const { withTransaction } = require('../src/db');
const fixture = require('./helpers/missionProtocolFixture');
const continuity = require('../src/services/missionProtocols/continuity');
const { successor, effect } = require('./test_mission_protocols_continuity');

async function main() {
  const ctx = await fixture.create();
  try {
    const first = await fixture.seal(ctx);
    await continuity.initialize(first);
    const second = await successor(ctx);
    let unlock;
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { unlock = resolve; });
    const event = withTransaction(ctx.db, async () => {
      await continuity.beforeEffect(first, { eventType: 'AGENT_THINKING', payload: { executionRunId: first.runId } });
      entered();
      await gate;
      await ctx.db.run('UPDATE strategy_execution_runs SET metrics_json=? WHERE id=?', JSON.stringify({ tokens: 7 }), first.runId);
    });
    await started;
    let transferred = false;
    const transition = continuity.initialize(second).then(value => { transferred = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(transferred, false, 'succession shares the native effect transaction mutex');
    unlock();
    await event;
    assert.equal((await transition).generation, 2);
    await assert.rejects(effect(first, 70), /STALE_INCARNATION/);
    const checkpoint = await ctx.db.get('SELECT body FROM mission_protocol_continuity_checkpoints');
    assert.equal(JSON.parse(JSON.parse(checkpoint.body).run.metrics_json).tokens, 7,
      'sealed source reflects the native effect committed before transfer');
    console.log('Mission CONTINUITY succession/effect race shares actual SQLite transaction fence: PASS');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
