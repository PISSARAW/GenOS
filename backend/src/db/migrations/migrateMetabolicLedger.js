'use strict';

async function migrateMetabolicLedger(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS metabolic_ledger_observations (
    observation_id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    thread_id TEXT,
    organization_id TEXT,
    project_id TEXT,
    provider TEXT,
    model TEXT,
    operation_id TEXT,
    started_at TEXT,
    finished_at TEXT,
    observed_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))
  );
  CREATE TABLE IF NOT EXISTS metabolic_ledger_measurements (
    observation_id TEXT NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN (
      'input_tokens', 'cache_creation_tokens', 'cache_read_tokens',
      'output_tokens', 'billable_tokens', 'catalog_cost_usd',
      'billed_cost_usd', 'tool_cost_usd', 'runtime_cost_usd',
      'active_time_ms', 'wall_time_ms'
    )),
    value REAL,
    source TEXT NOT NULL CHECK (source IN (
      'exact', 'provider_receipt', 'estimated', 'unavailable'
    )),
    evidence_ref TEXT,
    estimation_method TEXT,
    unavailable_reason TEXT,
    PRIMARY KEY (observation_id, metric),
    FOREIGN KEY (observation_id) REFERENCES metabolic_ledger_observations(observation_id)
      ON DELETE RESTRICT,
    CHECK (value IS NULL OR value >= 0),
    CHECK ((source = 'unavailable') = (value IS NULL)),
    CHECK (source != 'provider_receipt' OR evidence_ref IS NOT NULL),
    CHECK (source != 'estimated' OR estimation_method IS NOT NULL),
    CHECK (source != 'unavailable' OR unavailable_reason IS NOT NULL)
  );
  CREATE INDEX IF NOT EXISTS idx_metabolic_ledger_mission
    ON metabolic_ledger_observations(mission_id, observed_at, observation_id);
  CREATE INDEX IF NOT EXISTS idx_metabolic_ledger_thread
    ON metabolic_ledger_observations(thread_id, observed_at, observation_id)
    WHERE thread_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_metabolic_ledger_scope
    ON metabolic_ledger_observations(organization_id, project_id, observed_at);
  CREATE TRIGGER IF NOT EXISTS metabolic_observations_immutable
    BEFORE UPDATE ON metabolic_ledger_observations
    BEGIN SELECT RAISE(ABORT, 'Metabolic observations are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS metabolic_observations_no_delete
    BEFORE DELETE ON metabolic_ledger_observations
    BEGIN SELECT RAISE(ABORT, 'Metabolic observations are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS metabolic_measurements_immutable
    BEFORE UPDATE ON metabolic_ledger_measurements
    BEGIN SELECT RAISE(ABORT, 'Metabolic measurements are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS metabolic_measurements_no_delete
    BEFORE DELETE ON metabolic_ledger_measurements
    BEGIN SELECT RAISE(ABORT, 'Metabolic measurements are append-only'); END;
  `);
}

module.exports = { migrateMetabolicLedger };
