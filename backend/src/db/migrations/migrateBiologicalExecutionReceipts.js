'use strict';

async function migrateBiologicalExecutionReceipts(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS biological_execution_receipts (
    receipt_id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    receipt_schema TEXT NOT NULL,
    tick INTEGER,
    operation TEXT NOT NULL,
    cost REAL NOT NULL CHECK (cost >= 0),
    cost_unit TEXT NOT NULL,
    cell_id TEXT,
    genome_id TEXT,
    identity_status TEXT NOT NULL CHECK (identity_status IN ('resolved', 'organism_scope')),
    payload_hash TEXT NOT NULL,
    receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
    homeostasis_state_id TEXT,
    homeostasis_status TEXT,
    receipt_origin TEXT,
    origin_signature TEXT,
    origin_nonce TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_biological_receipts_mission
    ON biological_execution_receipts(mission_id, tick, created_at);
  CREATE INDEX IF NOT EXISTS idx_biological_receipts_homeostasis
    ON biological_execution_receipts(homeostasis_state_id);
  CREATE TABLE IF NOT EXISTS biological_execution_missions (
    mission_id TEXT PRIMARY KEY,
    rust_mission_id TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE
  );
  `);
  await addOriginColumns(db);
}

async function addOriginColumns(db) {
  const columns = await db.all('PRAGMA table_info(biological_execution_receipts)');
  const names = new Set(columns.map((column) => column.name));
  for (const [name, type] of [['receipt_origin', 'TEXT'], ['origin_signature', 'TEXT'], ['origin_nonce', 'TEXT']]) {
    if (!names.has(name)) await db.exec(`ALTER TABLE biological_execution_receipts ADD COLUMN ${name} ${type}`);
  }
}

module.exports = { migrateBiologicalExecutionReceipts };
