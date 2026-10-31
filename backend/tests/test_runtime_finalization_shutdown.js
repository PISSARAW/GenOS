'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const tasks = require('../src/services/runtimeMissionTasks');
const state = require('../src/services/agentOrchestrationState');
const garage = require('../src/services/garageRuntimeService');
const rounds = require('../src/services/agentRoundService');
const { finalizeMissionStart } = require('../src/services/agentRuntimeAdapter/missionExecution');
const polling = require('../bin/orchestratorCompletionPolling.cjs');
const shutdown = require('../src/services/telemetryShutdownService');

async function main() {
  const db = openDatabase();
  await db.exec('CREATE TABLE receipts (kind TEXT)');
  const originalGarage = garage.finalizeAgent;
  const originalResume = rounds.resumeMorphogenesisBarrierForWorker;
  const order = [];
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  garage.finalizeAgent = async () => {
    await held;
    await db.run('INSERT INTO receipts VALUES (?)', 'garage');
    order.push('garage');
  };
  rounds.resumeMorphogenesisBarrierForWorker = async () => {
    tasks.track(Promise.resolve().then(async () => {
      await db.run('INSERT INTO receipts VALUES (?)', 'follow-up');
      order.push('follow-up');
    }));
  };
  try {
    state.missionStarts.set('shutdown-test', Promise.resolve());
    const finalization = tasks.track(finalizeMissionStart('shutdown-test'));
    assert.equal(state.missionStarts.has('shutdown-test'), false,
      'Identity is already released while the real garage finalizer is awaiting.');
    assert.equal(tasks.hasPending(), true);
    assert.equal(polling.terminalReady([{ status: 'idle', latest_run_status: 'failed' }], [], 'worker'), false);
    assert.equal(polling.allOrphaned([{ status: 'running' }], Date.now() - 60000), false,
      'An in-process operation is not an orphan.');
    const closing = shutdown.closeAfterFlush({ beforeFlush: tasks.drain,
      telemetry: { flush: async () => {
        assert.equal((await db.all('SELECT * FROM receipts')).length, 2);
        order.push('flush'); return { flushed: true, pending: 0 };
      } }, closeDatabase: async () => { order.push('close'); await db.close(); } });
    await Promise.resolve();
    assert.deepEqual(order, []);
    release();
    await Promise.all([finalization, closing]);
    assert.deepEqual(order, ['garage', 'follow-up', 'flush', 'close']);
    assert.equal(tasks.hasPending(), false);
    assert.equal(polling.terminalReady([{ status: 'idle', latest_run_status: 'failed' }], [], 'worker'), true);
    const rejected = tasks.track(Promise.reject(new Error('failed startup')));
    await assert.rejects(rejected, /failed startup/);
    await tasks.drain();
    assert.equal(tasks.hasPending(), false);
  } finally {
    garage.finalizeAgent = originalGarage;
    rounds.resumeMorphogenesisBarrierForWorker = originalResume;
    state.missionStarts.delete('shutdown-test');
  }
  console.log('PASS real SQLite finalization, nested runtime drain and terminal polling');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
