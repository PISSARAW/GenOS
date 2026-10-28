'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const queue = require('../src/services/agentRecovery/durableRecoveryQueue');
const { resumeDurableWorkerRecoveries } = require('../src/services/agentRecovery/dispatchWorkerRecovery');
const { pendingWorkerRecoveries } = require('../src/services/agentOrchestrationState');
const { randomUUID } = require('node:crypto');

async function run() {
  const dbPath = path.join(__dirname, `worker-recovery-durable-${randomUUID()}.db`);
  try { fs.unlinkSync(dbPath); } catch (_) {}
  process.env.GENOS_ADMIN_PASSWORD ||= 'test-admin-password';
  const db = await getDatabase(dbPath);
  try {
    const input = { agentId: 'durable-worker', id: 'durable-mission', apiToken: 'short-lived',
      toolLease: ['one'], executionBudget: { tokens: 1000 } };
    const key = JSON.stringify(['durable-mission', 'durable-worker', 1, 'unresolved_task']);
    await queue.enqueue({ workerId: 'durable-worker', mission: input, report: { attempt: 1 },
      decision: { action: 'mutate_worker' }, key });
    await queue.enqueue({ workerId: 'durable-worker', mission: input, report: { attempt: 1 },
      decision: { action: 'mutate_worker' }, key });
    const rows = await db.all('SELECT * FROM worker_recovery_queue WHERE recovery_key=?', key);
    assert.equal(rows.length, 1, 'repeated enqueue is idempotent');
    assert.ok(!rows[0].payload_json.includes('short-lived'), 'credentials are omitted from persistence');
    let claim = await queue.claim('durable-worker');
    assert.equal(claim.status, 'queued');
    await queue.finish(claim, 'retry');
    await closeDatabase();
    const reopenedDb = await getDatabase(dbPath);
    claim = await queue.claim('durable-worker');
    assert.ok(claim, 'retry remains claimable after process restart');
    await queue.finish(claim, 'retry');
    await queue.cancel('durable-worker');
    assert.equal(await queue.isClaimActive(claim), false, 'a cancelled claim is fenced before launch');
    assert.equal(await queue.claim('durable-worker'), null, 'cancelled recovery cannot replay');
    const cancelled = await reopenedDb.get('SELECT status FROM worker_recovery_queue WHERE recovery_key=?', key);
    assert.equal(cancelled.status, 'cancelled');

    const staleKey = JSON.stringify(['stale-mission', 'stale-worker', 2, 'unresolved_task']);
    await queue.enqueue({ workerId: 'stale-worker', mission: { id: 'stale-mission' },
      report: { attempt: 2 }, decision: { action: 'mutate_worker' }, key: staleKey });
    const staleClaim = await queue.claim('stale-worker');
    assert.equal((await queue.recoverAbandonedClaims(reopenedDb)).length, 0,
      'a fresh claimed lease is not stolen by startup reconciliation');
    await reopenedDb.run(`UPDATE worker_recovery_queue SET claim_expires_at=datetime('now','-1 second')
      WHERE recovery_key=?`, staleKey);
    pendingWorkerRecoveries.clear();
    const resumedIds = [];
    const resumed = await resumeDurableWorkerRecoveries(reopenedDb, async (workerId) => {
      resumedIds.push(workerId);
      return true;
    });
    assert.deepEqual(resumedIds, ['stale-worker'], 'startup scan rehydrates an expired claim with empty memory state');
    assert.equal(resumed.resumed, 1);
    assert.equal(await queue.isClaimActive(staleClaim), false, 'old process claim is fenced after recovery');
  } finally {
    await closeDatabase();
    try { fs.unlinkSync(dbPath); } catch (_) {}
    delete process.env.GENOS_DB_PATH;
  }
  console.log('Durable worker recovery queue checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
