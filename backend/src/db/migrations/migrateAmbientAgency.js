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
  `);
}

module.exports = { migrateAmbientAgency };
