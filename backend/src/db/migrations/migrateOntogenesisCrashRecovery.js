'use strict';

async function migrateOntogenesisCrashRecovery(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_recovery_receipts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL REFERENCES ontogenesis_operations(id) ON DELETE CASCADE,
      recovery_attempt INTEGER NOT NULL CHECK (recovery_attempt > 0),
      owner TEXT NOT NULL,
      before_state TEXT NOT NULL,
      disposition TEXT NOT NULL,
      observed_state TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (operation_id, recovery_attempt)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_recovery_receipts_project
      ON ontogenesis_recovery_receipts(project_id, created_at, operation_id);
  `);
}

module.exports = { migrateOntogenesisCrashRecovery };
