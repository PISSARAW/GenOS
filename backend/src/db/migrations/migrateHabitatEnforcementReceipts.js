'use strict';

async function migrateHabitatEnforcementReceipts(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS habitat_enforcement_receipts (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    execution_run_id TEXT NOT NULL,
    habitat_id TEXT NOT NULL,
    habitat_revision INTEGER NOT NULL CHECK(habitat_revision > 0),
    habitat_hash TEXT NOT NULL,
    binding_hash TEXT NOT NULL,
    runtime_kind TEXT NOT NULL CHECK(runtime_kind = 'process'),
    process_id INTEGER NOT NULL CHECK(process_id > 0),
    guarantee TEXT NOT NULL CHECK(guarantee = 'wall_clock_ms'),
    limit_value REAL NOT NULL CHECK(limit_value > 0),
    enforcer TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    receipt_hash TEXT NOT NULL UNIQUE,
    FOREIGN KEY(habitat_id, habitat_revision)
      REFERENCES habitat_revisions(habitat_id, revision)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_habitat_enforcement_run_guarantee
    ON habitat_enforcement_receipts(execution_run_id, guarantee);
  CREATE INDEX IF NOT EXISTS idx_habitat_enforcement_mission
    ON habitat_enforcement_receipts(mission_id, agent_id, issued_at);
  CREATE TRIGGER IF NOT EXISTS habitat_enforcement_receipt_no_update
    BEFORE UPDATE ON habitat_enforcement_receipts
    BEGIN SELECT RAISE(ABORT, 'Immutable habitat enforcement receipt'); END;
  CREATE TRIGGER IF NOT EXISTS habitat_enforcement_receipt_no_delete
    BEFORE DELETE ON habitat_enforcement_receipts
    BEGIN SELECT RAISE(ABORT, 'Immutable habitat enforcement receipt'); END;`);
}

module.exports = { migrateHabitatEnforcementReceipts };
