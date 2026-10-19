'use strict';

async function migrateShevCodingStewardship(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_coding_missions (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      owner_agent_id TEXT NOT NULL,
      objective TEXT NOT NULL,
      mandate_version INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'open'
        CHECK(state IN ('open','effect_pending','verified','recovery_required','closed')),
      generation INTEGER NOT NULL DEFAULT 0,
      current_attempt_id TEXT,
      last_event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, mission_id)
    );
    CREATE TABLE IF NOT EXISTS shev_coding_attempts (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      owner_agent_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN
        ('executing','transported','delivered','ambiguous','failed','reconciled')),
      lease_expires_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, attempt_id),
      UNIQUE(organization_id, project_id, mission_id, generation),
      FOREIGN KEY(organization_id, project_id, mission_id)
        REFERENCES shev_coding_missions(organization_id, project_id, mission_id)
        ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS shev_coding_events (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      parent_event_id TEXT,
      attempt_id TEXT,
      kind TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, event_id),
      UNIQUE(organization_id, project_id, mission_id, sequence),
      FOREIGN KEY(organization_id, project_id, mission_id)
        REFERENCES shev_coding_missions(organization_id, project_id, mission_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_shev_coding_attempt_state
      ON shev_coding_attempts(organization_id, project_id, mission_id, status);
    CREATE INDEX IF NOT EXISTS idx_shev_coding_event_chain
      ON shev_coding_events(organization_id, project_id, mission_id, sequence);
    CREATE TRIGGER IF NOT EXISTS shev_coding_event_no_update
      BEFORE UPDATE ON shev_coding_events
      BEGIN SELECT RAISE(ABORT, 'SHEV coding events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_coding_event_no_delete
      BEFORE DELETE ON shev_coding_events
      BEGIN SELECT RAISE(ABORT, 'SHEV coding events are durable evidence'); END;
  `);
}

module.exports = { migrateShevCodingStewardship };
