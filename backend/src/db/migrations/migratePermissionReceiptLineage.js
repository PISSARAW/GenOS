'use strict';

const { migrateMissionEpisodes } = require('./migrateMissionEpisodes');
const { migrateToolPermissionMembrane } = require('./migrateToolPermissionMembrane');

async function migratePermissionReceiptLineage(db) {
  await migrateMissionEpisodes(db);
  await migrateToolPermissionMembrane(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS tool_permission_receipt_lineage (
    receipt_id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    authorization_hash TEXT NOT NULL,
    lineage_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receipt_id) REFERENCES tool_permission_receipts(receipt_id) ON DELETE RESTRICT,
    FOREIGN KEY (thread_id, episode_id, mission_id, organization_id, project_id)
      REFERENCES cell_threads(thread_id, episode_id, mission_id, organization_id, project_id)
      ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS idx_permission_lineage_episode
    ON tool_permission_receipt_lineage(
      organization_id, project_id, mission_id, episode_id, created_at, receipt_id
    );
  CREATE TRIGGER IF NOT EXISTS tool_permission_lineage_immutable
  BEFORE UPDATE ON tool_permission_receipt_lineage
  BEGIN
    SELECT RAISE(ABORT, 'TOOL_PERMISSION_LINEAGE_IMMUTABLE');
  END;
  CREATE TRIGGER IF NOT EXISTS tool_permission_lineage_no_delete
  BEFORE DELETE ON tool_permission_receipt_lineage
  BEGIN
    SELECT RAISE(ABORT, 'TOOL_PERMISSION_LINEAGE_IMMUTABLE');
  END;`);
}

module.exports = { migratePermissionReceiptLineage };
