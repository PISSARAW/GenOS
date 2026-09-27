'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateVersionedContractReceipts } = require('../src/db/migrations/migrateVersionedContractReceipts');
const { ensureOutboxTables } = require('../src/storage/projection/projectionOutbox');
const { createReceipt } = require('../src/services/versionedContractService');
const { persistReceipt, loadReceipt, listReceiptEvents } = require('../src/services/versionedContractPersistenceService');

function candidatePayload() {
  return { id: 'candidate-lot03', parentIds: [], genome: { ontology: 'test' }, origin: { kind: 'test' }, metrics: { score: 1 }, status: 'candidate' };
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateVersionedContractReceipts(db);
  await ensureOutboxTables(db);
  const receipt = createReceipt('MorphogeneticCandidate', candidatePayload(), { runId: 'run-lot03', sourceRefs: ['evidence:1'] });
  const first = await persistReceipt(db, receipt);
  assert.strictEqual(first.inserted, true);
  assert.strictEqual(first.eventInserted, true);
  const second = await persistReceipt(db, receipt);
  assert.strictEqual(second.inserted, false);
  assert.strictEqual(second.eventInserted, false);
  assert.strictEqual(second.receiptId, first.receiptId);
  assert.deepStrictEqual(await loadReceipt(db, receipt.receiptId), receipt);
  assert.strictEqual((await listReceiptEvents(db, receipt.receiptId)).length, 1);
  assert.strictEqual((await db.get('SELECT COUNT(*) AS count FROM versioned_contract_receipts')).count, 1);
  const conflict = { ...receipt, payload: { ...receipt.payload, id: 'different' } };
  await assert.rejects(() => persistReceipt(db, conflict), (error) => error.code === 'RECEIPT_ID_CONFLICT');
  await db.close();
  console.log('✅ versioned contract persistence tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
