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
    console.log('Biological Rust/backend receipt persistence and idempotency passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
