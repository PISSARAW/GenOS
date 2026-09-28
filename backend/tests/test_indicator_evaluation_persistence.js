'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateVersionedContractReceipts } = require('../src/db/migrations/migrateVersionedContractReceipts');
const { ensureOutboxTables } = require('../src/storage/projection/projectionOutbox');
const { evaluateReceiptSet, RECEIPT_SCHEMA } = require('../src/services/indicatorReceiptService');
const { persistIndicatorEvaluation, loadIndicatorEvaluation } = require('../src/services/indicatorEvaluationPersistenceService');
const { createReceipt } = require('../src/services/versionedContractService');
const crypto = require('node:crypto');

function receipt(id) {
  const content = `evidence ${id}`;
  const stage = { status: 'passed', evidenceRefs: [`artifact-${id}`] };
  const later = { status: 'not_run', evidenceRefs: [] };
  return {
    schema: RECEIPT_SCHEMA, id, registryVersion: 'genos.indicator-registry/v1',
    profile: 'node-runtime', property: 'GWT-3',
    protocol: { id: 'test', version: '1' },
    stages: { specified: stage, implemented: stage, causal: later, generalized: later, operational: later },
    artifacts: [{ ref: `artifact-${id}`, content, sha256: crypto.createHash('sha256').update(content).digest('hex') }],
    result: { outcome: 'observed' }, limits: ['test'], provenance: { runId: `run-${id}`, source: 'test' },
  };
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateVersionedContractReceipts(db);
    await ensureOutboxTables(db);
    const report = evaluateReceiptSet([receipt('one'), receipt('two')]);
    const first = await persistIndicatorEvaluation(db, report);
    assert.equal(first.inserted, true);
    assert.throws(() => createReceipt('IndicatorEvaluation', {
      ...first.receipt.payload, reportHash: '0'.repeat(64),
    }), { code: 'INVALID_VERSIONED_CONTRACT' });
    const loaded = await loadIndicatorEvaluation(db, first.receiptId);
    assert.equal(loaded.payload.report.receiptCount, 2);
    assert.equal((await loadIndicatorEvaluation(db, 'missing')), null);
    const repeat = await persistIndicatorEvaluation(db, report);
    assert.equal(repeat.inserted, false);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM versioned_contract_receipts')).count, 1);
  } finally {
    await db.close();
  }
  console.log('Indicator evaluation persistence: SQLite receipt, hash verification and idempotency passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
