'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/db');
const missionExecution = require('../src/services/agentRuntimeAdapter/missionExecution');

function databaseStub() {
  const statements = [];
  return {
    statements,
    async run(sql, ...params) { statements.push({ sql, params }); }
  };
}

async function withDatabaseStub(db, action) {
  const original = database.getDatabase;
  database.getDatabase = async () => db;
  try { await action(); } finally { database.getDatabase = original; }
}

test('a post-run bootstrap failure closes only the exact execution run as failed', async () => {
  const db = databaseStub();
  const failure = missionExecution.attachExecutionRunId(new Error('capsule provisioning failed'),
    { id: 'run-created-for-worker-a' });
  assert.equal(failure.executionRunId, 'run-created-for-worker-a', 'bootstrap preserves the exact created run ID');
  await withDatabaseStub(db, async () => missionExecution.recordMissionStartFailure('worker-a', failure));

  const runUpdate = db.statements.find((entry) => entry.sql.includes('UPDATE strategy_execution_runs'));
  assert.ok(runUpdate, 'the created execution run is closed');
  assert.match(runUpdate.sql, /completed_at\s*=\s*CURRENT_TIMESTAMP/);
  assert.match(runUpdate.sql, /guardrail_reason\s*=\s*\?/);
  assert.deepEqual(runUpdate.params.slice(0, 1), ['failed']);
  assert.match(runUpdate.params[1], /capsule provisioning failed/);
  assert.deepEqual(runUpdate.params.slice(2), ['run-created-for-worker-a', 'worker-a'],
    'the update is scoped by the transported run ID and owning agent');
});

test('a bootstrap failure before run creation does not mutate any execution run', async () => {
  const db = databaseStub();
  const failure = missionExecution.attachExecutionRunId(new Error('strategy contract lookup failed'), null);
  assert.equal(failure.executionRunId, undefined);
  await withDatabaseStub(db, async () => missionExecution.recordMissionStartFailure('worker-b', failure));

  assert.equal(db.statements.some((entry) => entry.sql.includes('UPDATE strategy_execution_runs')), false);
  assert.equal(db.statements.length, 1, 'only the agent failure is persisted');
});

test('a cancelled post-run bootstrap closes the exact run as cancelled', async () => {
  const db = databaseStub();
  const failure = Object.assign(new Error('mission stopped'), { code: 'MISSION_CANCELLED' });
  missionExecution.attachExecutionRunId(failure, { id: 'run-c' });
  await withDatabaseStub(db, async () => missionExecution.recordMissionStartFailure('worker-c', failure));

  const runUpdate = db.statements.find((entry) => entry.sql.includes('UPDATE strategy_execution_runs'));
  assert.equal(runUpdate.params[0], 'cancelled');
  assert.deepEqual(runUpdate.params.slice(2), ['run-c', 'worker-c']);
});
