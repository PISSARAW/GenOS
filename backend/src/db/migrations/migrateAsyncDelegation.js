'use strict';

async function migrateAsyncDelegation(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_delegations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      mandate_version INTEGER NOT NULL CHECK (mandate_version > 0),
      authority_ref TEXT NOT NULL,
      producer_id TEXT NOT NULL,
      capsule_path TEXT NOT NULL,
      base_revision TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      plan_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned','running','interrupted','accepted','no_change','human_review')),
      cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor >= 0),
      fence INTEGER NOT NULL DEFAULT 0 CHECK (fence >= 0),
      lease_owner TEXT,
      lease_expires_at TEXT,
      decision_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_delegations_resume
      ON ontogenesis_delegations(project_id, status, lease_expires_at);

    CREATE TABLE IF NOT EXISTS ontogenesis_delegation_checkpoints (
      mission_id TEXT NOT NULL REFERENCES ontogenesis_delegations(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      step_id TEXT NOT NULL,
      fence INTEGER NOT NULL CHECK (fence > 0),
      state_json TEXT NOT NULL,
      state_hash TEXT NOT NULL,
      artifact_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (mission_id, sequence)
    );
  `);
}

module.exports = { migrateAsyncDelegation };
