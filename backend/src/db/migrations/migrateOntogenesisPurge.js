'use strict';

async function migrateOntogenesisPurge(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_purge_receipts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      state TEXT NOT NULL DEFAULT 'prepared'
        CHECK (state IN ('prepared','completed','failed')),
      manifest_hash TEXT NOT NULL,
      scope_json TEXT NOT NULL DEFAULT '{}',
      counts_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_onto_purge_receipts_project
      ON ontogenesis_purge_receipts(project_id, created_at, id);
    CREATE TRIGGER IF NOT EXISTS trg_onto_purge_receipts_terminal_immutable
    BEFORE UPDATE ON ontogenesis_purge_receipts
    WHEN OLD.state IN ('completed','failed')
    BEGIN
      SELECT RAISE(ABORT, 'ontogenesis_purge_receipt_immutable');
    END;
    CREATE TRIGGER IF NOT EXISTS trg_onto_purge_receipts_no_delete
    BEFORE DELETE ON ontogenesis_purge_receipts
    BEGIN
      SELECT RAISE(ABORT, 'ontogenesis_purge_receipt_immutable');
    END;
  `);
}

module.exports = { migrateOntogenesisPurge };
