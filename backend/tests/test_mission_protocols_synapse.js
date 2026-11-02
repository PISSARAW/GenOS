'use strict';

process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-protocols-synapse-tests';
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const fixture = require('./helpers/missionProtocolFixture');
const synapse = require('../src/services/missionProtocols/synapse');

async function parentRun(ctx) {
  await ctx.db.run('INSERT INTO mission_agents (mission_id,agent_id,role) VALUES (?,?,?)', 'worker-mission', 'parent', 'orchestrator');
  return require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: 'parent', contractRecord: ctx.contractRecord, missionId: 'worker-mission',
    budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
}

async function main() {
  const ctx = await fixture.create();
  try {
    await parentRun(ctx);
    ctx.normalizedMission.prompt = 'Inspect the real scoped mission input.';
    const applied = await synapse.prepare(ctx);
    assert.equal(applied.status, 'applied');
    assert.equal(applied.state.value.task, ctx.normalizedMission.prompt);
    assert.equal(applied.receipt.receiver.agentId, ctx.agentId);
    assert.equal(ctx.normalizedMission.synapseContext.publisher.agentId, 'parent');
    const binding = await fixture.seal(ctx);
    assert.equal((await synapse.beforeExecution(binding)).receipt.receiptDigest, applied.receipt.receiptDigest);
    const db = new Database(path.join(binding.directory, 'synapse.sqlite'));
    try {
      const types = db.prepare('SELECT message_json FROM synapse_conversation_events ORDER BY sequence').all()
        .map(row => JSON.parse(row.message_json).type);
      assert.deepEqual(types, ['DECLARE_CONTEXT', 'OFFER_DELTA', 'APPLY_DELTA']);
      assert.equal(db.prepare('SELECT COUNT(*) count FROM synapse_state_receipts').get().count, 1);
      db.prepare("UPDATE dialect_symbols SET canonical_meaning='remote-improvised-meaning' WHERE symbol='P'").run();
      await assert.rejects(synapse.beforeExecution(binding), /context changed|missing|meaning|digest/i);
    } finally { db.close(); }
    await ctx.db.run("UPDATE agents SET workspace_id=NULL WHERE id='worker'");
    await assert.rejects(synapse.beforeExecution(binding), /scope|SCOPE|tenant|workspace/i);
    console.log('Mission SYNAPSE: actual parent/worker context applied, consumed before seal, durable receipt and stale dictionary refusal passed.');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
