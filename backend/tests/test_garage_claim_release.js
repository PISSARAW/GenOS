const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const garage = require('../src/services/workerGarageService');
const { getDatabase, closeDatabase } = require('../src/db');

const DB_PATH = path.resolve(__dirname, 'garage-claim-release-test.db');

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function insertAgent(db, agent) {
  await db.run(
    "INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id, workspace_id) VALUES (?, ?, 'implementation', ?, 'worker', 'claim-orch', ?)",
    agent.id, agent.id, agent.status, agent.workspaceId || null
  );
}

async function insertClaim(db, claim) {
  await db.run(
    `INSERT INTO garage_queue (request_id, orchestrator_id, worker_id, mode, status, phase, request_json, lease_id, lease_expires_at, deadline_at)
     VALUES (?, 'claim-orch', ?, 'surface', ?, 'ready', '{}', ?, ?, ?)`,
    claim.requestId, claim.workerId, claim.status, `lease-${claim.requestId}`,
    iso(claim.leaseOffsetMs), iso(claim.deadlineOffsetMs)
  );
}

async function claimStatus(db, requestId) {
  return db.get('SELECT status, error_text AS errorText FROM garage_queue WHERE request_id = ?', requestId);
}

async function setup(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('claim-org', 'Claim Org')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('claim-project', 'claim-org', 'Claim Project')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('claim-ws', 'Claim WS', ?, 'claim-org', 'claim-project')", __dirname);
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('claim-ws-2', 'Claim WS 2', ?, 'claim-org', 'claim-project')", __dirname);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('claim-orch', 'Orch', 'orchestrator', 'running', 'orchestrator', 'claim-ws')");
  await insertAgent(db, { id: 'claim-dead', status: 'error' });
  await insertAgent(db, { id: 'claim-done', status: 'completed' });
  await insertAgent(db, { id: 'claim-live', status: 'running' });
  await insertAgent(db, { id: 'claim-idle', status: 'idle' });
  await insertAgent(db, { id: 'claim-foreign', status: 'idle', workspaceId: 'claim-ws-2' });
  await insertClaim(db, { requestId: 'req-dead', workerId: 'claim-dead', status: 'claimed', leaseOffsetMs: 60000, deadlineOffsetMs: 3600000 });
  await insertClaim(db, { requestId: 'req-done', workerId: 'claim-done', status: 'completed', leaseOffsetMs: 60000, deadlineOffsetMs: 3600000 });
  await insertClaim(db, { requestId: 'req-live', workerId: 'claim-live', status: 'claimed', leaseOffsetMs: 60000, deadlineOffsetMs: 3600000 });
  await insertClaim(db, { requestId: 'req-expired', workerId: 'claim-idle', status: 'claimed', leaseOffsetMs: -60000, deadlineOffsetMs: 3600000 });
  await insertClaim(db, { requestId: 'req-orphan', workerId: 'claim-ghost', status: 'claimed', leaseOffsetMs: 60000, deadlineOffsetMs: 3600000 });
}

async function completedClaims(db) {
  const row = await db.get("SELECT COUNT(*) AS count FROM garage_queue WHERE status = 'completed'");
  return row.count;
}

async function run() {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-admin-password';
  const db = await getDatabase(DB_PATH);
  try {
    await setup(db);

    const releasedDead = await garage.releaseStaleWorkerClaims(db, 'claim-dead');
    assert.equal(releasedDead, 1, 'a dead worker must release its stale claim');
    assert.deepEqual(await claimStatus(db, 'req-dead'), { status: 'failed', errorText: 'worker_terminal_claim_released' });

    assert.equal(await garage.releaseStaleWorkerClaims(db, 'claim-live'), 0, 'a live worker keeps its claim');
    assert.equal((await claimStatus(db, 'req-live')).status, 'claimed');

    assert.equal(await garage.releaseStaleWorkerClaims(db, 'claim-done'), 0, 'validated completed work is preserved');
    assert.equal((await claimStatus(db, 'req-done')).status, 'completed');

    assert.equal(await garage.releaseStaleWorkerClaims(db, 'claim-idle'), 1, 'an expired lease is released');
    assert.equal((await claimStatus(db, 'req-expired')).status, 'expired');

    assert.equal(await garage.releaseStaleWorkerClaims(db, 'claim-ghost'), 1, 'orphan claims are released');
    assert.equal((await claimStatus(db, 'req-orphan')).status, 'failed');

    assert.equal(await completedClaims(db), 1, 'claim release must never promote a row to completed');

    assert.equal(await garage.enterIdleState(db, 'claim-dead'), true, 'a dead worker returns to idle once its claim is gone');
    const reserved = await garage.reserveSlot(db, {
      orchestratorId: 'claim-orch', workerId: 'claim-dead',
      name: 'Verify · redispatch', role: 'independent_reviewer', mission: 'redispatch mission'
    });
    assert.equal(reserved.reserved, true, 'the same workerId can be re-dispatched');
    assert.equal((await db.get("SELECT status FROM agents WHERE id = 'claim-dead'")).status, 'running');

    await assert.rejects(() => garage.reserveSlot(db, {
      orchestratorId: 'claim-orch', workerId: 'claim-foreign',
      name: 'Verify · foreign', role: 'independent_reviewer', mission: 'foreign mission'
    }), (error) => /SCOPE/.test(error.code || ''), 'scope violations must report SCOPE, never GARAGE');
  } finally {
    await closeDatabase();
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  }
  console.log('Garage claim release checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
