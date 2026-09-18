const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'survival-telemetry-test';
const { getDatabase, closeDatabase } = require('../src/db');
const survivalState = require('../src/services/survivalStateService');
const strategyService = require('../src/services/strategyExecutionService');

async function run() {
  const dbPath = path.resolve(__dirname, 'test-survival-telemetry.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    const observed = await survivalState.observe(db, 'telemetry-agent', { tokens: 12000 });
    assert.equal(observed.state, 'nominal');
    const result = await strategyService.recordExecutionEvent(db, 'missing-agent', {});
    assert.equal(result, null);
    const degraded = await survivalState.observe(db, 'telemetry-agent', { tokens: 1000, uncertainty: 0.9, recentFailures: 1 });
    assert.equal(degraded.state, 'protected');
    assert.equal(degraded.pressures.includes('starvation'), true);
    console.log('Survival telemetry observations remain persisted and bounded.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
