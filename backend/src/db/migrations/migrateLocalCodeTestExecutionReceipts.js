'use strict';

async function migrateLocalCodeTestExecutionReceipts(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS local_code_test_execution_receipts (
    receipt_id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    execution_run_id TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('passed', 'failed')),
    receipt_hash TEXT NOT NULL UNIQUE,
    receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_local_code_test_receipts_mission
    ON local_code_test_execution_receipts(mission_id, agent_id, created_at);
  CREATE TRIGGER IF NOT EXISTS local_code_test_receipts_no_update
    BEFORE UPDATE ON local_code_test_execution_receipts
    BEGIN SELECT RAISE(ABORT, 'Local code test execution receipts are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS local_code_test_receipts_no_delete
    BEFORE DELETE ON local_code_test_execution_receipts
    BEGIN SELECT RAISE(ABORT, 'Local code test execution receipts are immutable'); END;`);
}

module.exports = { migrateLocalCodeTestExecutionReceipts };
