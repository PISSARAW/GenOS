'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { openDatabase, authoritySchema } = require('./helpers/biologyDatabase');
const receipts = require('../src/services/biologicalExecutionReceiptService');

function sample() {
  const mission_id = randomUUID();
  const cell_id = randomUUID();
  const genome_id = randomUUID();
  const genome_fingerprint = 'sha256:' + 'a'.repeat(64);
  const population = { schema: 'genos.population-state/v1', mission_id, tick: 3, phase: 'after_tick',
    active_cells: [{ cell_id, genome_id, genome_fingerprint, cell_state: { cell_id, genome_id }, genome_state: {} }] };
  return { schema: receipts.RECEIPT_SCHEMA, receipt_id: randomUUID(), mission_id, cell_id,
    genome_id, genome_fingerprint, tick: 3, execution_scope: 'organism', operation: 'Observe',
    metabolic_register: 'rust_orchestrator_metabolism', cost: 1, cost_unit: 'atp_token',
    consumed: true, completed: true, observed_at_unix_ms: 1, population_json: JSON.stringify(population) };
}

async function mappedPopulation(db) {
  const receipt = sample();
  const options = { backendMissionId: 'backend-mission', origin: { origin: 'genos-rust-cli', verifiedLocal: true } };
  await assert.rejects(receipts.ingestBiologicalReceipt(db, receipt, { backendMissionId: options.backendMissionId }),
    { code: 'BIOLOGICAL_RECEIPT_POPULATION_ORIGIN_REQUIRED' });
  const results = await Promise.all([0, 1].map(() => receipts.ingestBiologicalReceipt(db, receipt, options)));
  assert.equal(results.filter(item => item.duplicate).length, 1);
  const row = await db.get('SELECT receipt_json FROM biological_execution_receipts WHERE receipt_id = ?', receipt.receipt_id);
  const stored = JSON.parse(row.receipt_json);
  assert.equal(stored.mission_id, 'backend-mission');
  assert.equal(stored.rust_mission_id, receipt.mission_id);
  const cell = await db.get('SELECT * FROM rust_cell_registry WHERE mission_id = ?', 'backend-mission');
  assert.equal(cell.cell_id, receipt.cell_id);
  await assert.rejects(receipts.ingestBiologicalReceipt(db, { ...receipt, cost: 2 }, options), { code: 'BIOLOGICAL_RECEIPT_ID_CONFLICT' });
  await assert.rejects(db.run('UPDATE biological_execution_receipts SET receipt_json = ?', '{}'), /Immutable/);
  await assert.rejects(db.run('DELETE FROM biological_execution_receipts'), /Immutable/);
  await assert.rejects(receipts.ingestBiologicalReceipt(db, receipt, { backendMissionId: options.backendMissionId }),
    { code: 'BIOLOGICAL_RECEIPT_POPULATION_ORIGIN_REQUIRED' });
}

async function rollback(db) {
  const receipt = sample();
  await db.exec("CREATE TRIGGER reject_cell BEFORE INSERT ON rust_cell_registry BEGIN SELECT RAISE(ABORT, 'cell write failed'); END;");
  await assert.rejects(receipts.ingestBiologicalReceipt(db, receipt, {
    backendMissionId: 'other-mission', origin: { signature: 'test-authenticated-channel' }
  }), /cell write failed/);
  assert.equal(await db.get('SELECT receipt_id FROM biological_execution_receipts WHERE receipt_id = ?', receipt.receipt_id), undefined);
  assert.equal(await db.get('SELECT * FROM rust_population_heads WHERE mission_id = ?', 'other-mission'), undefined);
  await assert.rejects(receipts.ingestBiologicalReceipt(db, { ...receipt, genome_id: randomUUID() }, {
    backendMissionId: 'other-mission', origin: { signature: 'test-authenticated-channel' }
  }), { code: 'BIOLOGICAL_RECEIPT_POPULATION_INVALID' });
}

async function main() {
  const db = openDatabase();
  try {
    await authoritySchema(db);
    await db.exec("INSERT INTO missions VALUES ('backend-mission', 'first', 'active'); INSERT INTO missions VALUES ('other-mission', 'second', 'active');");
    await mappedPopulation(db); await rollback(db);
  } finally { await db.close(); }
  console.log('Atomic Rust population ingestion, origin checks, mission remapping and idempotency passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
