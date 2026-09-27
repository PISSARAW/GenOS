'use strict';

async function migrateVersionedContractReceipts(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS versioned_contract_receipts (
      receipt_id TEXT PRIMARY KEY,
      contract_type TEXT NOT NULL,
      contract_version TEXT NOT NULL,
      schema TEXT NOT NULL,
      run_id TEXT,
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(contract_type, contract_version, payload_hash),
      CHECK (json_valid(source_refs_json)),
      CHECK (json_valid(payload_json))
    );
    CREATE INDEX IF NOT EXISTS idx_versioned_receipts_type_time
      ON versioned_contract_receipts(contract_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_versioned_receipts_run
      ON versioned_contract_receipts(run_id);
  `);
}

module.exports = { migrateVersionedContractReceipts };
