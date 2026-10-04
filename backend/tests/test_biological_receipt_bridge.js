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
const { ingestBiologicalReceipt, runMissionTick } = require('../src/services/biologicalExecutionReceiptService');
const missionContinuity = require('../src/services/missionContinuityService');
const biologicalReceiptController = require('../src/controllers/biologicalReceiptController');
const receiptOrigin = require('../src/middleware/biologicalReceiptOrigin');

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

    const divisionMissionId = randomUUID();
    await db.run('INSERT INTO missions (mission_id, objective) VALUES (?, ?)', divisionMissionId, 'division receipt bridge');
    const genosCli = require('../src/services/genosCli');
    const originalRunGenos = genosCli.runGenos;
    const divisionReceiptId = randomUUID();
    const divisionFixture = { schema: 'genos.cell-division-receipt/v1', receipt_id: divisionReceiptId,
      parent_cell_id: randomUUID(), daughter_cell_id: randomUUID(), parent_genome_id: randomUUID(),
      daughter_genome_id: randomUUID(), lineage_id: randomUUID(), generation: 2, requested_cost: 12,
      consumed_cost: 12, cost_unit: 'atp_token', completed: true, reason: null, observed_at_unix_ms: 4322 };
    genosCli.runGenos = async (args) => {
      assert.ok(args.includes('--divide'), 'backend opt-in reaches the Rust CLI');
      const rustMissionId = args[args.indexOf('--mission-id') + 1];
      return { ok: true, json: { operation: 'biological_mission_tick', mission_id: rustMissionId, tick: 1, receipts: [
        { schema: 'genos.biological-execution-receipt/v1', receipt_id: randomUUID(), mission_id: rustMissionId,
          cell_id: null, genome_id: null, tick: 1, execution_scope: 'organism', operation: 'Observe',
          metabolic_register: 'rust_orchestrator_metabolism', cost: 0, cost_unit: 'atp_token', consumed: false,
          completed: true, observed_at_unix_ms: 4321 },
        { ...divisionFixture, mission_id: rustMissionId }
      ] } };
    };
    try {
      const divisionResult = await runMissionTick(db, { missionId: divisionMissionId, divide: true });
      assert.equal(divisionResult.receipts.length, 2);
      const persistedDivision = await db.get('SELECT mission_id, receipt_schema, operation, cell_id, genome_id, receipt_json FROM biological_execution_receipts WHERE receipt_id = ?', divisionReceiptId);
      assert.equal(persistedDivision.mission_id, divisionMissionId);
      assert.equal(persistedDivision.receipt_schema, 'genos.cell-division-receipt/v1');
      assert.equal(persistedDivision.operation, 'cell_division');
      assert.ok(persistedDivision.cell_id && persistedDivision.genome_id);
      assert.ok(JSON.parse(persistedDivision.receipt_json).daughter_cell_id);
      const duplicateDivision = await runMissionTick(db, { missionId: divisionMissionId, divide: true });
      assert.ok(duplicateDivision.receipts.find((row) => row.receiptId === divisionReceiptId)?.duplicate,
        'division receipt ingestion is idempotent across repeated backend delivery');
      await closeDatabase();
      db = await getDatabase(dbPath);
      assert.ok(JSON.parse((await db.get('SELECT receipt_json FROM biological_execution_receipts WHERE receipt_id = ?', divisionReceiptId)).receipt_json).lineage_id,
        'parent/child lineage remains available after backend database restart');
    } finally {
      genosCli.runGenos = originalRunGenos;
    }

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
    const origin = 'genos-rust-orchestrator';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomUUID();
    const signingSecret = 'test-rust-receipt-origin-secret';
    process.env.GENOS_RUST_RECEIPT_SECRET = signingSecret;
    const signature = receiptOrigin.signReceipt({ receipt: scopedReceipt, metadata: { origin, timestamp, nonce }, secret: signingSecret });
    const headers = { origin, timestamp, nonce, signature };
    assert.equal(receiptOrigin.validSignature({ receipt: scopedReceipt, headers, secret: signingSecret }), true);
    assert.equal(receiptOrigin.validSignature({ receipt: { ...scopedReceipt, cost: 2 }, headers, secret: signingSecret }), false,
      'changing signed receipt content must invalidate origin authentication');
    assert.equal(await receiptOrigin.claimNonce(db, origin, nonce), true);
    assert.equal(await receiptOrigin.claimNonce(db, origin, nonce), false, 'origin nonce cannot be replayed');
    await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', scope.organizationId, 'Receipt Org');
    await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', scope.projectId, scope.organizationId, 'Receipt Project');
    await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)', 'receipt-workspace', 'Receipt Workspace', path.dirname(dbPath), scope.organizationId, scope.projectId);
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, 'Receipt Agent', 'orchestrator', 'running', 'orchestrator', ?)", 'receipt-agent', 'receipt-workspace');
    await db.run('INSERT INTO missions (mission_id, objective) VALUES (?, ?)', scopedMissionId, 'tenant receipt ingestion');
    await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)', scopedMissionId, 'receipt-agent', 'orchestrator');
    const authenticated = await authenticateOrigin(scopedReceipt, { origin, timestamp, nonce: randomUUID() }, signingSecret);
    assert.equal(authenticated.calledNext, true, 'valid signed receipt passes origin middleware');
    const accepted = await callReceiptController(scopedReceipt, scope, authenticated.origin);
    assert.equal(accepted.statusCode, 201);
    const replay = await authenticateOrigin(scopedReceipt, authenticated.metadata, signingSecret);
    assert.equal(replay.statusCode, 409, 'middleware rejects a replayed signed nonce');
    const persistedOrigin = await db.get('SELECT receipt_origin, origin_signature, origin_nonce FROM biological_execution_receipts WHERE receipt_id = ?', scopedReceipt.receipt_id);
    assert.deepEqual(persistedOrigin, {
      receipt_origin: origin, origin_signature: authenticated.origin.signature, origin_nonce: authenticated.origin.nonce,
    });
    const refused = await callReceiptController(scopedReceipt, { organizationId: 'other-org', projectId: 'other-project' });
    assert.equal(refused.statusCode, 404, 'receipts cannot be ingested across project scopes');
    console.log('Biological Rust/backend receipt persistence and idempotency passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

async function authenticateOrigin(receipt, metadata, secret) {
  const signature = receiptOrigin.signReceipt({ receipt, metadata, secret });
  const headers = {
    'x-genos-receipt-origin': metadata.origin,
    'x-genos-receipt-timestamp': metadata.timestamp,
    'x-genos-receipt-nonce': metadata.nonce,
    'x-genos-receipt-signature': signature,
  };
  const req = { body: { receipt }, get: (name) => headers[name.toLowerCase()] };
  const result = { statusCode: 200, body: null, calledNext: false, origin: null, metadata };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
  await receiptOrigin.requireBiologicalReceiptOrigin(req, res, (error) => {
    if (error) throw error;
    result.calledNext = true;
    result.origin = req.biologicalReceiptOrigin;
  });
  return result;
}

async function callReceiptController(receipt, tenant, biologicalReceiptOrigin = null) {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await biologicalReceiptController.ingest({ body: receipt, tenant, biologicalReceiptOrigin }, res, (error) => { throw error; });
  return result;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
