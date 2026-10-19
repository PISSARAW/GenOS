'use strict';

async function migrateShevEndogenousInitiative(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_observation_attestations (
      project_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      PRIMARY KEY (project_id, observation_id),
      FOREIGN KEY (project_id, observation_id)
        REFERENCES shev_observations(project_id, id)
    );
    CREATE TRIGGER IF NOT EXISTS shev_observation_attestations_no_update
      BEFORE UPDATE ON shev_observation_attestations
      BEGIN SELECT RAISE(ABORT, 'shev_observation_attestation_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_observation_attestations_no_delete
      BEFORE DELETE ON shev_observation_attestations
      BEGIN SELECT RAISE(ABORT, 'shev_observation_attestation_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_endogenous_arbitrations (
      project_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      mandate_version INTEGER NOT NULL,
      dimension TEXT NOT NULL,
      kind TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('ACT', 'NO_CHANGE')),
      reason TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      PRIMARY KEY (project_id, observation_id),
      FOREIGN KEY (project_id, observation_id)
        REFERENCES shev_observations(project_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shev_endogenous_arbitration_budget
      ON shev_endogenous_arbitrations(project_id, decision, decided_at);
    CREATE TRIGGER IF NOT EXISTS shev_endogenous_arbitrations_no_update
      BEFORE UPDATE ON shev_endogenous_arbitrations
      BEGIN SELECT RAISE(ABORT, 'shev_endogenous_arbitration_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_endogenous_arbitrations_no_delete
      BEFORE DELETE ON shev_endogenous_arbitrations
      BEGIN SELECT RAISE(ABORT, 'shev_endogenous_arbitration_immutable'); END;
  `);
}

module.exports = { migrateShevEndogenousInitiative };
