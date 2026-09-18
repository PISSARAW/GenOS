const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'survival-state-test';
const { getDatabase, closeDatabase } = require('../src/db');
const survivalState = require('../src/services/survivalStateService');

async function run() {
  const dbPath = path.resolve(__dirname, 'test-survival-state.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    const nominal = await survivalState.observe(db, 'survival-agent', { tokens: 12000, uncertainty: 0.1 });
    assert.equal(nominal.state, 'nominal');
    const protectedState = await survivalState.observe(db, 'survival-agent', { tokens: 1200, uncertainty: 0.8 });
    assert.equal(protectedState.state, 'protected');
    assert.equal(protectedState.version, 2);
    const dormant = await survivalState.observe(db, 'survival-agent', { energy: 0.05 });
    assert.equal(dormant.state, 'dormant');
    assert.equal(dormant.actions.includes('hibernate'), true);
    await assert.rejects(() => survivalState.observe(db, 'survival-agent', { tokens: 12000 }), { code: 'SURVIVAL_INVALID_TRANSITION' });
    const events = await db.all('SELECT event_type FROM survival_state_events WHERE agent_id = ? ORDER BY id', 'survival-agent');
    assert.equal(events.length, 3);
    assert.equal(events[2].event_type, 'SURVIVAL_DORMANT_ENTERED');
    console.log('Survival state persistence and guarded transitions passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
