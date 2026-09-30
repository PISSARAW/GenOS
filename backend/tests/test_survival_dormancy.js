const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'survival-dormancy-test';
const { getDatabase, closeDatabase } = require('../src/db');
const survivalState = require('../src/services/survivalStateService');
const runtime = require('../src/services/agentRuntimeAdapter');

async function run() {
  const dbPath = path.resolve(__dirname, 'test-survival-dormancy.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  let db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('dormant-agent', 'Dormant Agent', 'orchestrator', 'running', 'orchestrator')");
    const suspended = await survivalState.suspend(db, { agentId: 'dormant-agent', wakeCondition: { type: 'budget_restored', minimumTokens: 1000 } });
    assert.equal(suspended.success, true);
    assert.equal(suspended.state.state, 'dormant');
    assert.equal(suspended.snapshot.status || 'frozen', 'frozen');
    assert.equal(suspended.wakeCondition.status, 'armed');
    await closeDatabase();
    db = await getDatabase(dbPath);
    const wrongCondition = await survivalState.wake(db, {
      agentId: 'dormant-agent', wakeConditionId: suspended.wakeCondition.id, event: { type: 'provider_available' }
    });
    assert.equal(wrongCondition.code, 'SURVIVAL_WAKE_EVENT_MISMATCH');
    const wakeCommand = {
      agentId: 'dormant-agent', wakeConditionId: suspended.wakeCondition.id,
      event: { type: 'budget_restored', tokens: 1200 }
    };
    const wakeResults = await Promise.all([
      survivalState.wake(db, wakeCommand), survivalState.wake(db, wakeCommand)
    ]);
    assert.equal(wakeResults.filter((result) => result.success).length, 1, 'only one concurrent wake may claim the snapshot');
    const woken = wakeResults.find((result) => result.success);
    assert.equal(woken.success, true);
    assert.equal(woken.state.state, 'recovered');
    const snapshot = await db.get('SELECT status FROM cryptobiosis_snapshots WHERE snapshot_id = ?', suspended.snapshot.snapshotId);
    assert.equal(snapshot.status, 'thawed');
    const wake = await db.get('SELECT status FROM survival_wake_conditions WHERE id = ?', suspended.wakeCondition.id);
    assert.equal(wake.status, 'triggered');
    console.log('Survival dormancy snapshot and validated wake passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

async function testFailedResumeReturnsToDormancy(dbPath) {
  let db = await getDatabase(dbPath);
  const originalStartMission = runtime.startMission;
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('dispatch-fail-agent', 'Dispatch Fail', 'orchestrator', 'running', 'orchestrator')");
    const suspended = await survivalState.suspend(db, {
      agentId: 'dispatch-fail-agent',
      mission: { prompt: 'resume must be attempted' },
      wakeCondition: { type: 'operator_or_signal' }
    });
    runtime.startMission = async () => { throw new Error('controlled dispatch failure'); };
    const result = await survivalState.wake(db, {
      agentId: 'dispatch-fail-agent', wakeConditionId: suspended.wakeCondition.id
    });
    assert.equal(result.success, false);
    assert.equal(result.error, 'controlled dispatch failure');
    assert.equal((await survivalState.get(db, 'dispatch-fail-agent')).state, 'dormant');
    assert.equal((await require('../src/services/survivalWakeService').get({ db, id: suspended.wakeCondition.id })).status, 'armed');
    const snapshot = await db.get('SELECT status FROM cryptobiosis_snapshots WHERE snapshot_id = ?', suspended.snapshot.snapshotId);
    assert.equal(snapshot.status, 'frozen');
    console.log('Failed mission resume remains dormant and can be retried.');
  } finally {
    runtime.startMission = originalStartMission;
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (require('node:fs').existsSync(dbPath + suffix)) require('node:fs').unlinkSync(dbPath + suffix);
  }
}

run().then(() => testFailedResumeReturnsToDormancy(path.resolve(__dirname, 'test-survival-dispatch-fail.db')))
  .catch((error) => { console.error(error); process.exit(1); });
