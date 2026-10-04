'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'mission-replacement-test';
const dbApi = require('../src/db');
const identity = require('../src/services/missionIdentityService');
const regeneration = require('../src/services/regenerationService');
const garage = require('../src/services/workerGarageService');
const dispatch = require('../src/services/orchestratorDispatchService');

async function main() {
  const dbPath = path.join(__dirname, 'test-mission-replacement.db');
  for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  let db = await dbApi.getDatabase(dbPath);
  const originals = { reserveSlot: garage.reserveSlot, enterIdleState: garage.enterIdleState, dispatch: dispatch.dispatchWorkerMission };
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('replacement-orch', 'Orchestrator', 'orchestrator', 'idle', 'orchestrator')");
    await identity.create(db, { missionId: 'replacement-mission', objective: 'replace worker', orchestratorAgentId: 'replacement-orch' });
    garage.reserveSlot = async () => ({ reserved: true });
    dispatch.dispatchWorkerMission = async ({ agentId }) => {
      await db.run("UPDATE agents SET status = 'error', current_task = 'synthetic dispatch failure' WHERE id = ?", agentId);
      throw Object.assign(new Error('synthetic dispatch failure'), { code: 'DISPATCH_FAILED' });
    };
    const failed = await regeneration.regenerateWorker({
      db, missionId: 'replacement-mission', plan: { kind: 'workers', role: 'researcher', lostIdentifier: 'lost-worker' },
      organism: { tissues: { workers: [] }, memory: { scars: [] } }
    });
    assert.equal(failed.success, false);
    assert.equal(failed.status, 'error');
    const failedRow = await db.get('SELECT status FROM agents WHERE id = ?', failed.replacementId);
    assert.equal(failedRow.status, 'error');

    dispatch.dispatchWorkerMission = async ({ agentId }) => {
      await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", agentId);
      await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, payload_json)
        VALUES (?, 'EVIDENCE_REPORT', 'TEST_REPORT', ?)`, agentId, JSON.stringify({ evidenceReport: { outcome: 'success', claims: [{ evidence: ['verified replacement result'] }] } }));
    };
    garage.enterIdleState = async (_db, agentId) => { await db.run("UPDATE agents SET status = 'idle' WHERE id = ?", agentId); };
    const succeeded = await regeneration.regenerateWorker({
      db, missionId: 'replacement-mission', plan: { kind: 'workers', role: 'researcher', lostIdentifier: 'lost-worker' },
      organism: { tissues: { workers: [] }, memory: { scars: [] } }
    });
    assert.equal(succeeded.success, true, JSON.stringify(succeeded));
    assert.ok(succeeded.evidenceRef.startsWith('sha256:'));
    const attached = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id = ? AND agent_id = ?', 'replacement-mission', succeeded.replacementId);
    assert.ok(attached);
    const persisted = await db.get('SELECT status FROM agents WHERE id = ?', succeeded.replacementId);
    assert.equal(persisted.status, 'idle');
    await dbApi.closeDatabase();
    db = await dbApi.getDatabase(dbPath);
    const restartedAgent = await db.get('SELECT status FROM agents WHERE id = ?', succeeded.replacementId);
    const restartedMembership = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id = ? AND agent_id = ?', 'replacement-mission', succeeded.replacementId);
    assert.equal(restartedAgent.status, 'idle');
    assert.ok(restartedMembership);
    console.log('Mission replacement dispatch failure, verified success and durable membership passed.');
  } finally {
    garage.reserveSlot = originals.reserveSlot;
    garage.enterIdleState = originals.enterIdleState;
    dispatch.dispatchWorkerMission = originals.dispatch;
    await dbApi.closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
