'use strict';

async function migrateOntologyWorldReceipts(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontology_world_receipts (
      id TEXT PRIMARY KEY, world_id TEXT NOT NULL, execution_id TEXT,
      payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified', 'invalid')),
      organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verified_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_ontology_receipts_scope
      ON ontology_world_receipts(organization_id, project_id, world_id, created_at);
  `);
}

module.exports = { migrateOntologyWorldReceipts };
