'use strict';

async function migrateShevProductQualifications(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_product_qualifications (
      id TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL UNIQUE REFERENCES shev_product_manifests(id),
      user_effect_receipt_id TEXT NOT NULL REFERENCES shev_product_stage_receipts(id),
      project_initiative_id TEXT NOT NULL REFERENCES shev_initiatives(id),
      agent_progress_id TEXT NOT NULL REFERENCES shev_agent_progress(id),
      evidence_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      qualified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TRIGGER IF NOT EXISTS shev_product_qualification_no_update
      BEFORE UPDATE ON shev_product_qualifications
      BEGIN SELECT RAISE(ABORT, 'shev_product_qualification_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_product_qualification_no_delete
      BEFORE DELETE ON shev_product_qualifications
      BEGIN SELECT RAISE(ABORT, 'shev_product_qualification_immutable'); END;
  `);
}

module.exports = { migrateShevProductQualifications };
