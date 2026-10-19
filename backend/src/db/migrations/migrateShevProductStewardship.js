'use strict';

async function migrateShevProductStewardship(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_product_manifests (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES shev_responsibilities(project_id),
      mandate_version INTEGER NOT NULL,
      dimension TEXT NOT NULL,
      build_ref TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      authorization_nonce TEXT NOT NULL REFERENCES shev_authorizations(nonce),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (project_id, build_ref)
    );
    CREATE TRIGGER IF NOT EXISTS shev_product_manifest_no_update
      BEFORE UPDATE ON shev_product_manifests
      BEGIN SELECT RAISE(ABORT, 'shev_product_manifest_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_product_manifest_no_delete
      BEFORE DELETE ON shev_product_manifests
      BEGIN SELECT RAISE(ABORT, 'shev_product_manifest_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_product_stage_receipts (
      id TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL REFERENCES shev_product_manifests(id),
      stage TEXT NOT NULL CHECK (stage IN ('preview', 'deployed', 'user_effect')),
      result TEXT NOT NULL CHECK (result IN ('confirmed', 'regressed', 'inconclusive')),
      source_ref TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_shev_product_stage
      ON shev_product_stage_receipts(manifest_id, stage, observed_at);
    CREATE TRIGGER IF NOT EXISTS shev_product_stage_no_update
      BEFORE UPDATE ON shev_product_stage_receipts
      BEGIN SELECT RAISE(ABORT, 'shev_product_stage_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_product_stage_no_delete
      BEFORE DELETE ON shev_product_stage_receipts
      BEGIN SELECT RAISE(ABORT, 'shev_product_stage_immutable'); END;
  `);
}

module.exports = { migrateShevProductStewardship };
