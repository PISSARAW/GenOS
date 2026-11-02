'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-protocol-allostasis-race-test';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const path = require('node:path');
const fixture = require('./helpers/missionProtocolFixture');
const budget = require('../src/services/missionProtocols/allostasis');
const native = require('../src/services/missionProtocols/allostasisRuntime');
const source = require('../src/services/missionProtocols/allostasisSource');

async function prepared(ctx) {
  await ctx.db.run('INSERT INTO mission_agents VALUES (?,?,?)', 'worker-mission', 'parent', 'orchestrator');
  await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: 'parent', contractRecord: ctx.contractRecord, missionId: 'worker-mission',
    budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
  await budget.prepare(ctx);
  const binding = await fixture.seal(ctx);
  const runtime = native.open(binding, await source.regulator(binding));
  try {
    await runtime.usage.ready;
    await native.admit(binding, runtime);
    runtime.allocator.store.raw.prepare('DELETE FROM mission_time_runtime WHERE id=?').run(binding.runId);
  } finally { runtime.allocator.close(); }
  return binding;
}

async function main() {
  const ctx = await fixture.create();
  try {
    const binding = await prepared(ctx);
    const admissions = await Promise.allSettled([budget.beforeExecution(binding), budget.beforeExecution(binding)]);
    assert.equal(admissions.filter(result => result.status === 'fulfilled').length, 1,
      'one durable allocation must authorize only one execution start');
    const refused = admissions.find(result => result.status === 'rejected');
    assert.equal(refused.reason.code, 'MISSION_ALLOSTASIS_RECONCILIATION_REQUIRED');
    await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
      agentId: 'parent', contractRecord: ctx.contractRecord, missionId: 'worker-mission',
      budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
    const now = Date.now;
    let finals;
    try {
      Date.now = () => Date.parse(binding.expiresAt) + 1;
      finals = await Promise.all([budget.finish(binding), budget.finish(binding)]);
    } finally { Date.now = now; }
    assert.deepEqual(finals[0], finals[1], 'concurrent finish returns one durable settlement');
    const db = new Database(path.join(binding.directory, 'allostasis.sqlite'));
    try {
      const pool = JSON.parse(db.prepare('SELECT body FROM allostasis_pools').get().body);
      assert.equal(pool.consumed, finals[0].result.spent);
      assert.equal(pool.held, 0);
      assert.equal(pool.protectedReserve, 15000);
      assert.equal(db.prepare('SELECT COUNT(*) count FROM metabolic_ledger_observations').get().count, 1);
    } finally { db.close(); }
    console.log('Mission ALLOSTASIS races: interrupted admission, one start, one settlement after parent rotation and expiry passed.');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
