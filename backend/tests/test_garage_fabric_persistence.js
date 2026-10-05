'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const fabric = require('../src/services/garageFabricService');
const preemption = require('../src/services/garagePreemptionService');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  const dbPath = path.resolve(__dirname, 'garage-fabric-persistence.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-admin-password';
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, metadata_json) VALUES ('garage-parent', 'Parent', 'orchestrator', 'running', 'orchestrator', NULL, '{}')");
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id, metadata_json) VALUES ('garage-child', 'Child', 'implementation', 'running', 'worker', 'garage-parent', '{}')");
    const queued = await fabric.enqueuePersistent(db, { requestId: 'garage-request', orchestratorId: 'garage-parent', workerId: 'garage-child', priority: 0.9, mode: 'shuttle' });
    assert.equal(queued.status, 'queued');
    const claimed = await fabric.claimNextPersistent(db, { orchestratorId: 'garage-parent', now: '2026-01-01T00:00:00.000Z', ttlMs: 60000 });
    assert.equal(claimed.status, 'claimed');
    assert.equal(await fabric.updatePersistent(db, { requestId: 'garage-request', status: 'running' }), true);
    assert.equal(await fabric.updatePersistent(db, { requestId: 'garage-request', status: 'completed', result: { verified: false } }), true);
    const frozen = await preemption.freezeWorker({ db, workerId: 'garage-child', freeze: async () => ({ success: true, snapshotId: 'snap-garage-1', capsuleHash: 'a'.repeat(64), runtimeStopped: true }) });
    assert.equal(frozen.status, 'frozen');
    const thawed = await preemption.thawWorker({ db, workerId: 'garage-child', snapshotId: frozen.snapshotId, thaw: async () => ({ success: true }) });
    assert.equal(thawed.status, 'thawed');
    const child = await db.get("SELECT status FROM agents WHERE id = 'garage-child'");
    assert.equal(child.status, 'idle');
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Garage Fabric persistence checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
