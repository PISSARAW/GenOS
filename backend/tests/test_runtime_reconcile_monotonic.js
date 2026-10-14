'use strict';

const assert = require('node:assert/strict');
const { reconcilePersistedRuntimeRow, reconcilePersistedRuntimes,
  reconcileUntrackedWorkers } = require('../src/services/agentRuntimeAdapter/missionReconcile');

async function verifyTerminalRowsAreNotRewritten() {
  let updates = 0;
  const db = { run: async () => { updates += 1; return { changes: 1 }; } };
  const changed = await reconcilePersistedRuntimeRow(db, {
    id: 'completed-worker', status: 'completed', runtime_pid: 123, runtime_executable: 'node.exe'
  });
  assert.equal(changed, 0);
  assert.equal(updates, 0);
}

async function verifyOnlyRunningRowsAreScanned() {
  let query = '';
  await reconcilePersistedRuntimes({ all: async (sql) => { query = sql; return []; } });
  assert.match(query, /status = 'running'/);
}

async function verifyUntrackedWorkersNeedAnInactiveParent() {
  const updates = [];
  const db = {
    all: async (sql) => {
      assert.match(sql, /runtime_pid IS NULL/);
      assert.match(sql, /parent\.status IN \('running','blocked'\)/);
      return [{ id: 'stale-worker' }];
    },
    run: async (sql, id) => {
      updates.push({ sql, id });
      return { changes: 1 };
    }
  };
  assert.equal(await reconcileUntrackedWorkers(db), 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'stale-worker');
  assert.match(updates[0].sql, /status = 'terminated'/);
  assert.match(updates[0].sql, /NOT EXISTS \(SELECT 1 FROM garage_queue/);
}

Promise.all([verifyTerminalRowsAreNotRewritten(), verifyOnlyRunningRowsAreScanned(),
  verifyUntrackedWorkersNeedAnInactiveParent()])
  .then(() => console.log('Runtime reconciliation preserves terminal worker outcomes.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
