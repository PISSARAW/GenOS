'use strict';

const assert = require('node:assert/strict');
const { reconcilePersistedRuntimeRow, reconcilePersistedRuntimes,
  reconcileUntrackedWorkers, RUNTIME_DRAIN_GRACE_SECONDS } =
  require('../src/services/agentRuntimeAdapter/missionReconcile');
const { activeProcesses } = require('../src/services/agentOrchestrationState');

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

async function verifyLiveSupervisorOwnsReconciliation() {
  let updates = 0;
  activeProcesses.set('supervised-worker', { pid: 123 });
  try {
    const changed = await reconcilePersistedRuntimeRow({
      run: async () => { updates += 1; return { changes: 1 }; }
    }, {
      id: 'supervised-worker', status: 'running', runtime_pid: 123,
      runtime_executable: 'node.exe'
    });
    assert.equal(changed, 0);
    assert.equal(updates, 0);
  } finally {
    activeProcesses.delete('supervised-worker');
  }
}

async function verifyRecentEventsProtectCrossProcessDrain() {
  let update = null;
  const changed = await reconcilePersistedRuntimeRow({
    run: async (sql, ...args) => {
      update = { sql, args };
      return { changes: 0 };
    }
  }, {
    id: 'draining-worker', status: 'running', runtime_pid: 2147483647,
    runtime_executable: 'node.exe'
  });
  assert.equal(changed, 0);
  assert.match(update.sql, /NOT EXISTS/);
  assert.match(update.sql, /telemetry_events recent/);
  assert.match(update.sql, /recent\.agent_id = agents\.id/);
  assert.deepEqual(update.args, [
    'draining-worker', 2147483647, 'node.exe',
    `-${RUNTIME_DRAIN_GRACE_SECONDS} seconds`
  ]);
}

async function verifyUntrackedWorkersNeedAnInactiveParent() {
  const updates = [];
  const db = {
    exec: async () => {},
    get: async () => ({ current_budget: 0 }),
    all: async (sql) => {
      if (/PRAGMA table_info\(agents\)/.test(sql)) return [{ name: 'id' }];
      assert.match(sql, /runtime_pid IS NULL/);
      assert.match(sql, /parent\.status IN \('running','blocked'\)/);
      assert.match(sql, /NULL AS territory_id/);
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
  assert.match(updates[0].sql, /INSERT INTO worker_orphanage_grace/);
  assert.match(updates[0].sql, /status = 'SUSPECT'/);
}

Promise.all([verifyTerminalRowsAreNotRewritten(), verifyOnlyRunningRowsAreScanned(),
  verifyLiveSupervisorOwnsReconciliation(), verifyRecentEventsProtectCrossProcessDrain(),
  verifyUntrackedWorkersNeedAnInactiveParent()])
  .then(() => console.log('Runtime reconciliation preserves terminal worker outcomes.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
