'use strict';

async function migrateOntogenesisContinuity(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_handoffs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      source_host_id TEXT REFERENCES ontogenesis_hosts(id) ON DELETE SET NULL,
      target_host_id TEXT NOT NULL REFERENCES ontogenesis_hosts(id) ON DELETE RESTRICT,
      generation INTEGER NOT NULL CHECK (generation > 0),
      state TEXT NOT NULL DEFAULT 'prepared'
        CHECK (state IN ('prepared','active','expired','reclaimed','failed')),
      token_hash TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, generation)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_handoffs_project
      ON ontogenesis_handoffs(project_id, state, generation);

    CREATE TABLE IF NOT EXISTS ontogenesis_continuity (
      project_id TEXT PRIMARY KEY REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      state TEXT NOT NULL DEFAULT 'local'
        CHECK (state IN ('local','handoff_pending','remote_active','reclaim_required')),
      generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
      active_host_id TEXT REFERENCES ontogenesis_hosts(id) ON DELETE RESTRICT,
      handoff_id TEXT REFERENCES ontogenesis_handoffs(id) ON DELETE SET NULL,
      lease_expires_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ontogenesis_continuity_receipts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      handoff_id TEXT REFERENCES ontogenesis_handoffs(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      generation INTEGER NOT NULL CHECK (generation >= 0),
      host_id TEXT REFERENCES ontogenesis_hosts(id) ON DELETE SET NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_continuity_receipts
      ON ontogenesis_continuity_receipts(project_id, created_at, id);
  `);
}

module.exports = { migrateOntogenesisContinuity };
