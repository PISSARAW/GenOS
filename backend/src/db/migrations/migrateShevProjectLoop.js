'use strict';

async function migrateShevProjectLoop(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_responsibilities (
      project_id TEXT PRIMARY KEY REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      mandate_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS shev_mandates (
      project_id TEXT NOT NULL REFERENCES shev_responsibilities(project_id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      mandate_json TEXT NOT NULL,
      authority_ref TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, version)
    );
    CREATE TRIGGER IF NOT EXISTS shev_mandate_no_update BEFORE UPDATE ON shev_mandates
      BEGIN SELECT RAISE(ABORT, 'shev_mandate_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_mandate_no_delete BEFORE DELETE ON shev_mandates
      BEGIN SELECT RAISE(ABORT, 'shev_mandate_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_observations (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES shev_responsibilities(project_id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      dimension TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('state', 'degradation', 'risk', 'opportunity', 'capability_gap', 'blind_spot')),
      epistemic_status TEXT NOT NULL CHECK (epistemic_status IN ('observed', 'unknown', 'stale', 'invalid', 'inconclusive')),
      source TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      valid_until TEXT,
      summary TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shev_observations_project ON shev_observations(project_id, created_at);
    CREATE TABLE IF NOT EXISTS shev_initiatives (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      mandate_version INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('diagnose', 'instrument', 'investigate', 'experiment', 'learn')),
      status TEXT NOT NULL CHECK (status IN ('proposed', 'queued', 'rejected')),
      reason TEXT NOT NULL,
      task_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, observation_id),
      FOREIGN KEY (project_id, observation_id) REFERENCES shev_observations(project_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shev_initiatives_project ON shev_initiatives(project_id, status);
    CREATE TABLE IF NOT EXISTS shev_effects (
      initiative_id TEXT PRIMARY KEY REFERENCES shev_initiatives(id),
      post_observation_id TEXT NOT NULL,
      project_result TEXT NOT NULL CHECK (project_result IN ('confirmed', 'regressed', 'inconclusive')),
      agent_result TEXT NOT NULL CHECK (agent_result IN ('confirmed', 'inconclusive', 'not_tested')),
      verifier_ref TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      assessed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { migrateShevProjectLoop };
