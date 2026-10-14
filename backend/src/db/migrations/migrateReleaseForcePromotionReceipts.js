'use strict';

async function migrateReleaseForcePromotionReceipts(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS release_force_promotion_receipts (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      organization_id TEXT,
      project_id TEXT,
      actor_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK(length(trim(reason)) >= 12),
      approved_at TEXT NOT NULL,
      FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_release_force_promotion_receipts_scope
      ON release_force_promotion_receipts(organization_id, project_id, release_id, approved_at);
    CREATE TRIGGER IF NOT EXISTS release_force_promotion_receipts_no_update
      BEFORE UPDATE ON release_force_promotion_receipts
      BEGIN SELECT RAISE(ABORT, 'Release override receipts are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS release_force_promotion_receipts_no_delete
      BEFORE DELETE ON release_force_promotion_receipts
      BEGIN SELECT RAISE(ABORT, 'Release override receipts are append-only'); END;
  `);
}

module.exports = { migrateReleaseForcePromotionReceipts };
