'use strict';

const assert = require('node:assert/strict');
const { reconcilePersistedRuntimeRow, reconcilePersistedRuntimes } = require('../src/services/agentRuntimeAdapter/missionReconcile');

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

Promise.all([verifyTerminalRowsAreNotRewritten(), verifyOnlyRunningRowsAreScanned()])
  .then(() => console.log('Runtime reconciliation preserves terminal worker outcomes.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
