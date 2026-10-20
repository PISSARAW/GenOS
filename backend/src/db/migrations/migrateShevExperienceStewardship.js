'use strict';

async function migrateShevExperienceStewardship(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_experience_protocols (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES shev_responsibilities(project_id),
      dimension TEXT NOT NULL,
      protocol_json TEXT NOT NULL,
      authorization_nonce TEXT NOT NULL REFERENCES shev_authorizations(nonce),
      registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS shev_experience_checkpoints (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES shev_responsibilities(project_id),
      protocol_id TEXT NOT NULL REFERENCES shev_experience_protocols(id),
      observation_id TEXT NOT NULL,
      period TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      visual_drift REAL NOT NULL CHECK (visual_drift BETWEEN 0 AND 1),
      screenshot_json TEXT NOT NULL,
      test_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      UNIQUE (project_id, protocol_id, period),
      FOREIGN KEY (project_id, observation_id) REFERENCES shev_observations(project_id, id)
    );
    CREATE TABLE IF NOT EXISTS shev_experience_decisions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES shev_responsibilities(project_id),
      protocol_id TEXT NOT NULL REFERENCES shev_experience_protocols(id),
      checkpoint_id TEXT NOT NULL REFERENCES shev_experience_checkpoints(id),
      decision TEXT NOT NULL CHECK (decision IN ('REFINE', 'CHANGE_DIRECTION', 'NO_CHANGE')),
      reason TEXT NOT NULL,
      visual_verdict TEXT NOT NULL,
      user_effect_result TEXT NOT NULL,
      review_json TEXT NOT NULL,
      observation_id TEXT,
      authorization_nonce TEXT NOT NULL REFERENCES shev_authorizations(nonce),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (project_id, checkpoint_id),
      FOREIGN KEY (project_id, observation_id) REFERENCES shev_observations(project_id, id)
    );
    CREATE TRIGGER IF NOT EXISTS shev_experience_protocol_no_update
      BEFORE UPDATE ON shev_experience_protocols
      BEGIN SELECT RAISE(ABORT, 'shev_experience_protocol_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_experience_protocol_no_delete
      BEFORE DELETE ON shev_experience_protocols
      BEGIN SELECT RAISE(ABORT, 'shev_experience_protocol_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_experience_checkpoint_no_update
      BEFORE UPDATE ON shev_experience_checkpoints
      BEGIN SELECT RAISE(ABORT, 'shev_experience_checkpoint_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_experience_checkpoint_no_delete
      BEFORE DELETE ON shev_experience_checkpoints
      BEGIN SELECT RAISE(ABORT, 'shev_experience_checkpoint_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_experience_decision_no_update
      BEFORE UPDATE ON shev_experience_decisions
      BEGIN SELECT RAISE(ABORT, 'shev_experience_decision_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_experience_decision_no_delete
      BEFORE DELETE ON shev_experience_decisions
      BEGIN SELECT RAISE(ABORT, 'shev_experience_decision_immutable'); END;
  `);
}

module.exports = { migrateShevExperienceStewardship };
