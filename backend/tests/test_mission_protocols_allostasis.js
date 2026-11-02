'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-protocol-allostasis-test';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const path = require('node:path');
const fixture = require('./helpers/missionProtocolFixture');
const budget = require('../src/services/missionProtocols/allostasis');
const source = require('../src/services/missionProtocols/allostasisSource');
const { spawnSync } = require('node:child_process');

async function parentRun(ctx) {
  await ctx.db.run('INSERT INTO mission_agents VALUES (?,?,?)', 'worker-mission', 'parent', 'orchestrator');
  await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: 'parent', contractRecord: ctx.contractRecord, missionId: 'worker-mission',
    budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
}

async function main() {
  const ctx = await fixture.create();
  try {
    await parentRun(ctx);
    await budget.prepare(ctx);
    assert.equal(ctx.normalizedMission.timeoutMs, 285000);
    const binding = await fixture.seal(ctx);
    const captured = await source.describe(binding);
    assert.equal(captured.report.nativeSnapshot.service, 'mission.sealedBudget/v1');
    assert.equal(captured.forecast.nativeAssessment.available, false);
    await assert.rejects(source.qualify(binding, { report: { ...captured.report, missionId: 'foreign' } }));
    const admission = await budget.beforeExecution(binding);
    assert.equal(admission.status, 'admitted');
    assert.equal(admission.maximumMilliseconds, 285000);
    await assert.rejects(budget.beforeExecution(binding), { code: 'MISSION_ALLOSTASIS_RECONCILIATION_REQUIRED' });
    const preempted = await budget.preempt(binding);
    assert.equal(preempted.allocationStatus, 'preempted');
    assert.equal(preempted.unknownExposure, 285000);
    await new Promise(resolve => setTimeout(resolve, 25));
    const final = await budget.finish(binding);
    assert.equal(final.result.status, 'usage_recorded');
    assert.ok(final.result.spent >= 25);
    assert.equal(final.released.unknownExposure, 0);
    assert.deepEqual(await budget.finish(binding), final);
    const db = new Database(path.join(binding.directory, 'allostasis.sqlite'));
    try {
      const pool = JSON.parse(db.prepare('SELECT body FROM allostasis_pools').get().body);
      assert.equal(pool.protectedReserve, 15000);
      assert.equal(pool.held, 0);
      assert.equal(pool.consumed, final.result.spent);
      const state = JSON.parse(db.prepare('SELECT body FROM mission_time_runtime').get().body);
      delete state.finished;
      db.prepare('UPDATE mission_time_runtime SET body=?').run(JSON.stringify(state));
    } finally { db.close(); }
    const resumed = spawnSync(process.execPath, [path.join(__dirname, 'helpers/missionProtocolTimingChild.cjs'),
      path.join(ctx.root, 'control.sqlite'), binding.runId], { encoding: 'utf8', timeout: 30000 });
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.deepEqual(JSON.parse(resumed.stdout), final, 'persisted timing receipt survives a crash before summary acknowledgement');
    console.log('Mission ALLOSTASIS: sealed time allocation, real monotonic consumption, no redispatch and protected reserve passed.');
  } finally { await ctx.close(); }
}

async function unknownAfterRestart() {
  const ctx = await fixture.create();
  try {
    await parentRun(ctx);
    await budget.prepare(ctx);
    const binding = await fixture.seal(ctx);
    await budget.beforeExecution(binding);
    const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/missionProtocolTimingChild.cjs'),
      path.join(ctx.root, 'control.sqlite'), binding.runId], { encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.result.status, 'usage_unknown');
    assert.equal(result.released.spent, 0);
    assert.equal(result.released.held, 285000);
    assert.equal(result.released.unknownExposure, 285000);
    await assert.rejects(budget.beforeExecution(binding), { code: 'MISSION_ALLOSTASIS_RECONCILIATION_REQUIRED' });
    console.log('Mission ALLOSTASIS restart: unavailable timing retains full exposure and blocks redispatch.');
  } finally { await ctx.close(); }
}

main().then(unknownAfterRestart).catch(error => { console.error(error); process.exitCode = 1; });
