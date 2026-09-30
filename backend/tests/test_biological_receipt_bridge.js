'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const dbPath = path.join(os.tmpdir(), `genos_biological_bridge_${randomUUID()}.db`);
process.env.GENOS_DB_PATH = dbPath;
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'biological-bridge-test';
const { getDatabase, closeDatabase } = require('../src/db');
const { ingestBiologicalReceipt } = require('../src/services/biologicalExecutionReceiptService');
const missionContinuity = require('../src/services/missionContinuityService');
const biologicalReceiptController = require('../src/controllers/biologicalReceiptController');

function sampleReceipt(missionId, receiptId) {
  return {
    schema: 'genos.biological-execution-receipt/v1', receipt_id: receiptId, mission_id: missionId,
    cell_id: null, genome_id: null, genome_fingerprint: null, tick: 4, execution_scope: 'organism',
    operation: 'Observe', metabolic_register: 'rust_orchestrator_metabolism', cost: 1,
    cost_unit: 'atp_token', consumed: true, completed: true, observed_at_unix_ms: 1234
  };
}

async function run() {
  let db = await getDatabase(dbPath);
  try {
    const missionId = randomUUID();
    const receiptId = randomUUID();
    await db.run('INSERT INTO missions (mission_id, objective) VALUES (?, ?)', missionId, 'receipt bridge integration');
    await db.run(`INSERT INTO homeostasis_states (id, contract_id, mission_id, status, state_json)
      VALUES (?, ?, ?, ?, ?)`, [`state-${missionId}`, `contract-${missionId}`, missionId, 'unstable', '{}']);
    const receipt = sampleReceipt(missionId, receiptId);
    const outcomes = await Promise.all([
      ingestBiologicalReceipt(db, receipt), ingestBiologicalReceipt(db, receipt)
    ]);
    const first = outcomes.find((outcome) => !outcome.duplicate);
    const duplicate = outcomes.find((outcome) => outcome.duplicate);
    assert.ok(first, 'one concurrent writer creates the durable receipt');
    assert.ok(duplicate, 'the duplicate concurrent writer is idempotent');
    assert.equal(first.homeostasis.id, `state-${missionId}`);
    const stored = await db.get('SELECT * FROM biological_execution_receipts WHERE receipt_id = ?', receiptId);
    assert.equal(stored.mission_id, missionId);
    assert.equal(stored.cost, 1);
    assert.equal(stored.identity_status, 'organism_scope');
    assert.equal(stored.homeostasis_status, 'unstable');
    await assert.rejects(() => ingestBiologicalReceipt(db, { ...receipt, cost: 2 }), { code: 'BIOLOGICAL_RECEIPT_ID_CONFLICT' });
    await assert.rejects(() => ingestBiologicalReceipt(db, { ...receipt, mission_id: 'missing' }), { code: 'BIOLOGICAL_RECEIPT_IDENTITY_INVALID' });
    await assert.rejects(() => ingestBiologicalReceipt(db, sampleReceipt(randomUUID(), randomUUID())), { code: 'BIOLOGICAL_RECEIPT_MISSION_NOT_FOUND' });
    await closeDatabase();
    db = await getDatabase(dbPath);
    const reopened = await db.get('SELECT receipt_json FROM biological_execution_receipts WHERE receipt_id = ?', receiptId);
    assert.equal(JSON.parse(reopened.receipt_json).mission_id, missionId);

    const lateMissionId = randomUUID();
    const lateReceiptId = randomUUID();
    await db.run('INSERT INTO missions (mission_id, objective) VALUES (?, ?)', lateMissionId, 'late homeostasis correlation');
    await ingestBiologicalReceipt(db, sampleReceipt(lateMissionId, lateReceiptId));
    assert.equal((await db.get('SELECT homeostasis_state_id FROM biological_execution_receipts WHERE receipt_id = ?', lateReceiptId)).homeostasis_state_id, null);
    await missionContinuity.evaluateContinuity(db, { id: lateMissionId, objective: 'late homeostasis correlation', context: {} });
    const correlated = await db.get('SELECT homeostasis_state_id, homeostasis_status FROM biological_execution_receipts WHERE receipt_id = ?', lateReceiptId);
    assert.ok(correlated.homeostasis_state_id, 'later homeostasis evaluation must correlate earlier receipts');
    assert.ok(correlated.homeostasis_status);

    const scope = { organizationId: 'receipt-org', projectId: 'receipt-project' };
    const scopedMissionId = randomUUID();
    const scopedReceipt = sampleReceipt(scopedMissionId, randomUUID());
    await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', scope.organizationId, 'Receipt Org');
    await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', scope.projectId, scope.organizationId, 'Receipt Project');
    await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)', 'receipt-workspace', 'Receipt Workspace', path.dirname(dbPath), scope.organizationId, scope.projectId);
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, 'Receipt Agent', 'orchestrator', 'running', 'orchestrator', ?)", 'receipt-agent', 'receipt-workspace');
    await db.run('INSERT INTO missions (mission_id, objective) VALUES (?, ?)', scopedMissionId, 'tenant receipt ingestion');
    await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)', scopedMissionId, 'receipt-agent', 'orchestrator');
    const accepted = await callReceiptController(scopedReceipt, scope);
    assert.equal(accepted.statusCode, 201);
    const refused = await callReceiptController(scopedReceipt, { organizationId: 'other-org', projectId: 'other-project' });
    assert.equal(refused.statusCode, 404, 'receipts cannot be ingested across project scopes');
    console.log('Biological Rust/backend receipt persistence and idempotency passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

async function callReceiptController(receipt, tenant) {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await biologicalReceiptController.ingest({ body: receipt, tenant }, res, (error) => { throw error; });
  return result;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
