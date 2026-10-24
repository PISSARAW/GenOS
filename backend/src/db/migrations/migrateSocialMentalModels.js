'use strict';

async function migrateSocialMentalModels(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS social_mental_model_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    project_id TEXT NOT NULL DEFAULT '',
    subject_agent_id TEXT NOT NULL,
    other_agent_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    model_json TEXT NOT NULL,
    source_memory_ids_json TEXT NOT NULL,
    model_hash TEXT NOT NULL,
    intervention TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, project_id, subject_agent_id, other_agent_id, revision),
    CHECK (subject_agent_id <> other_agent_id)
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_social_model_scope_latest
    ON social_mental_model_snapshots
      (organization_id, project_id, subject_agent_id, other_agent_id, revision DESC)`);
}

module.exports = { migrateSocialMentalModels };
