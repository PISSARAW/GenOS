'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { referenceTime } = require('../src/services/epistemic/oracleObservationTime');

async function main() {
  const db = openDatabase();
  try {
    await db.exec(`CREATE TABLE strategy_execution_runs (
      id TEXT,agent_id TEXT,status TEXT,completed_at TEXT);`);
    const recorded = '2026-10-01T12:00:00.000Z';
    await db.run('INSERT INTO strategy_execution_runs VALUES(?,?,?,?)', 'done', 'owner', 'completed', recorded);
    await db.run('INSERT INTO strategy_execution_runs VALUES(?,?,?,?)', 'active', 'owner', 'running', recorded);
    assert.equal(await referenceTime(db, { runId: 'done', agentId: 'owner', completedEvidence: true }), Date.parse(recorded));
    const before = Date.now();
    assert.ok(await referenceTime(db, { runId: 'done', agentId: 'owner' }) >= before);
    for (const request of [{ runId: 'active', agentId: 'owner' }, { runId: 'done', agentId: 'foreign' }]) {
      await assert.rejects(referenceTime(db, { ...request, completedEvidence: true }),
        { code: 'ORACLE_COMPLETED_OBSERVATION_REQUIRED' });
    }
    console.log('Observation archive time: genuine completed-owner timestamps, fresh execution clock and running/foreign refusals passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
