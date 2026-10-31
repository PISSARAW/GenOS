'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-enqueue-regression-'));
const dbPath = path.join(root, 'recovery.db');
process.env.GENOS_ADMIN_PASSWORD ||= 'worker-enqueue-regression-only';
const { getDatabase, closeDatabase } = require('../src/db');
const state = require('../src/services/agentOrchestrationState');
const durable = require('../src/services/agentRecovery/durableRecoveryQueue');
const { queueWorkerRecovery } = require('../src/services/agentRecovery/queueWorkerRecovery');

async function run() {
  const original = durable.enqueue;
  const mission = { agentId: 'enqueue-regression-worker', missionId: 'enqueue-regression-mission',
    orchestratorAgentId: 'enqueue-regression-parent', communicationRequired: true };
  const failure = { eventType: 'AGENT_FAILED', detail: 'temporary failure' };
  let rejectWrite;
  let writeStarted;
  const started = new Promise(resolve => { writeStarted = resolve; });
  const blocked = new Promise((resolve, reject) => { rejectWrite = reject; });
  let calls = 0;
  try {
    await getDatabase(dbPath);
    durable.enqueue = async input => {
      calls++;
      if (calls === 1) { writeStarted(); return blocked; }
      return original(input);
    };
    const first = queueWorkerRecovery(mission, failure);
    const rejected = assert.rejects(first, { code: 'SQLITE_BUSY' });
    await started;
    const second = queueWorkerRecovery(mission, failure);
    await Promise.resolve();
    assert.equal(state.pendingWorkerRecoveries.has(mission.agentId), false,
      'No dispatchable recovery is visible before its durable write');
    assert.equal(calls, 1, 'Concurrent events for a worker must serialize');
    rejectWrite(Object.assign(new Error('database locked'), { code: 'SQLITE_BUSY' }));
    await rejected;
    assert.equal((await second).queued, true);
    assert.equal(calls, 2);
    assert.equal((await queueWorkerRecovery(mission, failure)).duplicate, true);
    assert.equal(calls, 2, 'A successful durable enqueue remains idempotent');
    state.pendingWorkerRecoveries.delete(mission.agentId);
    await closeDatabase();
    const reopened = await getDatabase(dbPath);
    const rows = await reopened.all('SELECT status FROM worker_recovery_queue WHERE worker_id=?', mission.agentId);
    assert.deepEqual(rows, [{ status: 'queued' }], 'Retry survives a database reopen with empty memory');
    await assertAtomicEnqueue(reopened, original);
  } finally {
    durable.enqueue = original;
    state.pendingWorkerRecoveries.delete(mission.agentId);
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function assertAtomicEnqueue(db, enqueue) {
  const previous = { workerId: 'atomic-worker', mission: { missionId: 'atomic-mission' },
    report: { attempt: 0 }, decision: { action: 'mutate_worker' }, key: 'atomic-old' };
  await enqueue(previous);
  const replacement = { ...previous, report: { attempt: 1 }, key: 'atomic-new' };
  const originalRun = db.run;
  db.run = function (sql, ...args) {
    if (sql.includes('INSERT OR IGNORE INTO worker_recovery_queue')) {
      return Promise.reject(Object.assign(new Error('insertion failed'), { code: 'SQLITE_BUSY' }));
    }
    return originalRun.call(this, sql, ...args);
  };
  try { await assert.rejects(enqueue(replacement), { code: 'SQLITE_BUSY' }); }
  finally { db.run = originalRun; }
  const preserved = await db.get('SELECT status FROM worker_recovery_queue WHERE recovery_key=?', previous.key);
  assert.equal(preserved.status, 'queued', 'A failed replacement cannot cancel the previous durable recovery');
  await enqueue(replacement);
  const next = await db.get('SELECT status FROM worker_recovery_queue WHERE recovery_key=?', replacement.key);
  assert.equal(next.status, 'queued');
}

run().then(() => console.log('Worker recovery: concurrent failure, retry, durability and idempotency passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
