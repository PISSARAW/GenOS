'use strict';

async function migrateProductionHealingCampaigns(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS production_telemetry_observations (
      project_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      evidence_digest TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(project_id, observation_id),
      FOREIGN KEY(project_id, observation_id)
        REFERENCES shev_observations(project_id, id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS production_healing_campaigns (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      producer_id TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
      status TEXT NOT NULL CHECK(status IN ('planned','ready_for_canary','canary_running','healed','failed')),
      plan_json TEXT NOT NULL,
      plan_hash TEXT NOT NULL,
      selected_candidate_id TEXT,
      rollout_id TEXT,
      scar_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, project_id, observation_id),
      FOREIGN KEY(project_id, observation_id)
        REFERENCES shev_observations(project_id, id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_production_healing_scope
      ON production_healing_campaigns(organization_id, project_id, status, created_at);
    CREATE TRIGGER IF NOT EXISTS production_telemetry_observations_no_update
      BEFORE UPDATE ON production_telemetry_observations
      BEGIN SELECT RAISE(ABORT, 'production telemetry observations are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS production_telemetry_observations_no_delete
      BEFORE DELETE ON production_telemetry_observations
      BEGIN SELECT RAISE(ABORT, 'production telemetry observations are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS production_healing_identity_no_update
      BEFORE UPDATE OF id, organization_id, project_id, observation_id, producer_id,
        severity, plan_json, plan_hash, created_at ON production_healing_campaigns
      BEGIN SELECT RAISE(ABORT, 'production healing campaign identity is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS production_healing_no_delete
      BEFORE DELETE ON production_healing_campaigns
      BEGIN SELECT RAISE(ABORT, 'production healing campaigns are durable evidence'); END;
  `);
}

module.exports = { migrateProductionHealingCampaigns };
