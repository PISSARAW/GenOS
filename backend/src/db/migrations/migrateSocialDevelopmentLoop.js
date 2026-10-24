'use strict';

async function migrateSocialDevelopmentLoop(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS social_development_observations (
    observation_key TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    observation_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'inconclusive')),
    claim_token TEXT NOT NULL,
    lease_expires_at TEXT NOT NULL,
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, project_id, agent_id, observation_id)
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_social_development_expired_claims
    ON social_development_observations(status, lease_expires_at)`);
}

module.exports = { migrateSocialDevelopmentLoop };
