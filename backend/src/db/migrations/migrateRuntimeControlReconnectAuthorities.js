'use strict';

async function migrateRuntimeControlReconnectAuthorities(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_control_reconnect_authorities (
      authority_id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      runtime_instance_id TEXT NOT NULL,
      backend_key_id TEXT NOT NULL CHECK (
        length(backend_key_id) = 71 AND substr(backend_key_id, 1, 7) = 'sha256:'
        AND substr(backend_key_id, 8) NOT GLOB '*[^0-9a-f]*'
      ),
      descriptor_json TEXT NOT NULL CHECK (json_valid(descriptor_json)),
      descriptor_hash TEXT NOT NULL CHECK (
        length(descriptor_hash) = 71 AND substr(descriptor_hash, 1, 7) = 'sha256:'
        AND substr(descriptor_hash, 8) NOT GLOB '*[^0-9a-f]*'
      ),
      status TEXT NOT NULL CHECK (status IN ('recoverable', 'revoked')),
      revision INTEGER NOT NULL CHECK (revision >= 1),
      revocation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      UNIQUE (runtime_instance_id),
      CHECK ((status = 'recoverable' AND revocation_reason IS NULL AND revoked_at IS NULL)
        OR (status = 'revoked' AND length(revocation_reason) BETWEEN 1 AND 1024
          AND revoked_at IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_reconnect_active_worker
      ON runtime_control_reconnect_authorities(worker_id) WHERE status = 'recoverable';
    CREATE INDEX IF NOT EXISTS idx_runtime_reconnect_scope
      ON runtime_control_reconnect_authorities(
        organization_id, project_id, mission_id, episode_id, thread_id, status
      );
    CREATE TRIGGER IF NOT EXISTS runtime_reconnect_authority_delete_guard
      BEFORE DELETE ON runtime_control_reconnect_authorities
      BEGIN SELECT RAISE(ABORT, 'RUNTIME_RECONNECT_AUTHORITY_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS runtime_reconnect_authority_update_guard
      BEFORE UPDATE ON runtime_control_reconnect_authorities
      WHEN OLD.authority_id IS NOT NEW.authority_id
        OR OLD.worker_id IS NOT NEW.worker_id
        OR OLD.mission_id IS NOT NEW.mission_id
        OR OLD.episode_id IS NOT NEW.episode_id
        OR OLD.thread_id IS NOT NEW.thread_id
        OR OLD.organization_id IS NOT NEW.organization_id
        OR OLD.project_id IS NOT NEW.project_id
        OR OLD.runtime_instance_id IS NOT NEW.runtime_instance_id
        OR OLD.backend_key_id IS NOT NEW.backend_key_id
        OR OLD.descriptor_json IS NOT NEW.descriptor_json
        OR OLD.descriptor_hash IS NOT NEW.descriptor_hash
        OR OLD.created_at IS NOT NEW.created_at
        OR OLD.status != 'recoverable' OR NEW.status != 'revoked'
        OR NEW.revision != OLD.revision + 1
        OR length(NEW.revocation_reason) NOT BETWEEN 1 AND 1024
        OR NEW.revoked_at IS NULL
      BEGIN SELECT RAISE(ABORT, 'RUNTIME_RECONNECT_AUTHORITY_MUTATION_DENIED'); END;
  `);
}

module.exports = { migrateRuntimeControlReconnectAuthorities };
