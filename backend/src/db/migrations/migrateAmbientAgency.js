'use strict';

async function migrateAmbientAgency(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ambient_responsibilities (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      responsibility_id TEXT NOT NULL,
      owner_agent_id TEXT NOT NULL,
      current_version INTEGER NOT NULL CHECK(current_version >= 1),
      status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
      current_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, responsibility_id)
    );
    CREATE TABLE IF NOT EXISTS ambient_responsibility_versions (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      responsibility_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version >= 1),
      previous_hash TEXT,
      content_hash TEXT NOT NULL,
      content_json TEXT NOT NULL,
      change_kind TEXT NOT NULL CHECK(change_kind IN ('CREATE','AMEND','REVOKE')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, responsibility_id, version),
      FOREIGN KEY(organization_id, project_id, responsibility_id)
        REFERENCES ambient_responsibilities(organization_id, project_id, responsibility_id)
        ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS ambient_observations (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      responsibility_id TEXT NOT NULL,
      responsibility_version INTEGER NOT NULL,
      source_app TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      consent_ref TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, observation_id),
      FOREIGN KEY(organization_id, project_id, responsibility_id)
        REFERENCES ambient_responsibilities(organization_id, project_id, responsibility_id)
        ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS ambient_observation_payloads (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      minimized_json TEXT,
      forgotten_at TEXT,
      PRIMARY KEY(organization_id, project_id, observation_id),
      FOREIGN KEY(organization_id, project_id, observation_id)
        REFERENCES ambient_observations(organization_id, project_id, observation_id)
        ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS ambient_observation_events (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      event_kind TEXT NOT NULL CHECK(event_kind IN ('INGEST','FORGET')),
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, event_id),
      FOREIGN KEY(organization_id, project_id, observation_id)
        REFERENCES ambient_observations(organization_id, project_id, observation_id)
        ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS ambient_feedback_candidates (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      feedback_id TEXT NOT NULL,
      responsibility_id TEXT NOT NULL,
      responsibility_version INTEGER NOT NULL,
      proposer_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      feedback_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, feedback_id),
      FOREIGN KEY(organization_id, project_id, responsibility_id)
        REFERENCES ambient_responsibilities(organization_id, project_id, responsibility_id)
        ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS ambient_learning_decisions (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      decision_id TEXT NOT NULL,
      feedback_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, decision_id),
      UNIQUE(organization_id, project_id, feedback_id),
      FOREIGN KEY(organization_id, project_id, feedback_id)
        REFERENCES ambient_feedback_candidates(organization_id, project_id, feedback_id)
        ON DELETE RESTRICT
    );
    CREATE TRIGGER IF NOT EXISTS ambient_responsibility_identity_immutable
      BEFORE UPDATE OF organization_id, project_id, responsibility_id, owner_agent_id,
        created_at ON ambient_responsibilities
      BEGIN SELECT RAISE(ABORT, 'Ambient responsibility identity is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_responsibility_head_guard
      BEFORE UPDATE OF current_version, current_hash, status ON ambient_responsibilities
      WHEN NEW.current_version != OLD.current_version + 1
        OR NEW.current_hash = OLD.current_hash
        OR (OLD.status = 'REVOKED' AND NEW.status != 'REVOKED')
      BEGIN SELECT RAISE(ABORT, 'Ambient responsibility head advance is invalid'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_responsibility_no_delete
      BEFORE DELETE ON ambient_responsibilities
      BEGIN SELECT RAISE(ABORT, 'Ambient responsibilities are durable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_responsibility_version_no_update
      BEFORE UPDATE ON ambient_responsibility_versions
      BEGIN SELECT RAISE(ABORT, 'Ambient responsibility versions are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_responsibility_version_no_delete
      BEFORE DELETE ON ambient_responsibility_versions
      BEGIN SELECT RAISE(ABORT, 'Ambient responsibility versions are durable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_observation_no_update
      BEFORE UPDATE ON ambient_observations
      BEGIN SELECT RAISE(ABORT, 'Ambient observation provenance is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_observation_no_delete
      BEFORE DELETE ON ambient_observations
      BEGIN SELECT RAISE(ABORT, 'Ambient observation provenance is durable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_payload_forget_only
      BEFORE UPDATE ON ambient_observation_payloads
      WHEN OLD.minimized_json IS NULL OR NEW.minimized_json IS NOT NULL
        OR OLD.forgotten_at IS NOT NULL OR NEW.forgotten_at IS NULL
      BEGIN SELECT RAISE(ABORT, 'Ambient payload can only be forgotten once'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_payload_no_delete
      BEFORE DELETE ON ambient_observation_payloads
      BEGIN SELECT RAISE(ABORT, 'Ambient payload tombstones are durable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_observation_event_no_update
      BEFORE UPDATE ON ambient_observation_events
      BEGIN SELECT RAISE(ABORT, 'Ambient observation events are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_observation_event_no_delete
      BEFORE DELETE ON ambient_observation_events
      BEGIN SELECT RAISE(ABORT, 'Ambient observation events are durable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_feedback_no_update
      BEFORE UPDATE ON ambient_feedback_candidates
      BEGIN SELECT RAISE(ABORT, 'Ambient feedback candidates are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_feedback_no_delete
      BEFORE DELETE ON ambient_feedback_candidates
      BEGIN SELECT RAISE(ABORT, 'Ambient feedback candidates are durable'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_learning_decision_no_update
      BEFORE UPDATE ON ambient_learning_decisions
      BEGIN SELECT RAISE(ABORT, 'Ambient learning decisions are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS ambient_learning_decision_no_delete
      BEFORE DELETE ON ambient_learning_decisions
      BEGIN SELECT RAISE(ABORT, 'Ambient learning decisions are durable'); END;
  `);
}

module.exports = { migrateAmbientAgency };
