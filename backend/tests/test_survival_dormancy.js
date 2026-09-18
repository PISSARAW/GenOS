const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'survival-dormancy-test';
const { getDatabase, closeDatabase } = require('../src/db');
const survivalState = require('../src/services/survivalStateService');

async function run() {
  const dbPath = path.resolve(__dirname, 'test-survival-dormancy.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('dormant-agent', 'Dormant Agent', 'orchestrator', 'running', 'orchestrator')");
    const suspended = await survivalState.suspend(db, { agentId: 'dormant-agent', wakeCondition: { type: 'budget_restored', minimumTokens: 1000 } });
    assert.equal(suspended.success, true);
    assert.equal(suspended.state.state, 'dormant');
    assert.equal(suspended.snapshot.status || 'frozen', 'frozen');
    assert.equal(suspended.wakeCondition.status, 'armed');
    const woken = await survivalState.wake(db, { agentId: 'dormant-agent', wakeConditionId: suspended.wakeCondition.id });
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

run().catch((error) => { console.error(error); process.exit(1); });
