'use strict';

const { migrateMissionEpisodes } = require('./migrateMissionEpisodes');

const MIGRATION_ID = '129-operator-control-receipts';

async function migrateOperatorControlReceipts(db) {
  await migrateMissionEpisodes(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS operator_control_commands (
    command_id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('pause', 'resume', 'cancel')),
    mission_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    authority TEXT NOT NULL,
    reason TEXT,
    expected_thread_revision INTEGER NOT NULL CHECK (expected_thread_revision >= 0),
    owner_token TEXT NOT NULL,
    lease_expires_at INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'applied', 'rejected')),
    result_code TEXT,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized_at TEXT,
    FOREIGN KEY (thread_id, episode_id, mission_id, organization_id, project_id)
      REFERENCES cell_threads(thread_id, episode_id, mission_id, organization_id, project_id)
      ON DELETE RESTRICT,
    UNIQUE (organization_id, project_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_operator_control_target
    ON operator_control_commands(
      organization_id, project_id, mission_id, episode_id, thread_id, created_at
    );
  CREATE TRIGGER IF NOT EXISTS operator_control_command_identity_immutable
  BEFORE UPDATE ON operator_control_commands
  WHEN NEW.command_id != OLD.command_id OR NEW.idempotency_key != OLD.idempotency_key
    OR NEW.request_hash != OLD.request_hash OR NEW.action != OLD.action
    OR NEW.mission_id != OLD.mission_id OR NEW.episode_id != OLD.episode_id
    OR NEW.thread_id != OLD.thread_id OR NEW.organization_id != OLD.organization_id
    OR NEW.project_id != OLD.project_id OR NEW.actor_id != OLD.actor_id
    OR NEW.authority != OLD.authority
    OR NEW.reason IS NOT OLD.reason
    OR NEW.expected_thread_revision != OLD.expected_thread_revision
  BEGIN SELECT RAISE(ABORT, 'OPERATOR_CONTROL_COMMAND_IDENTITY_IMMUTABLE'); END;
  CREATE TRIGGER IF NOT EXISTS operator_control_command_final_immutable
  BEFORE UPDATE ON operator_control_commands WHEN OLD.status != 'pending'
  BEGIN SELECT RAISE(ABORT, 'OPERATOR_CONTROL_COMMAND_FINAL_IMMUTABLE'); END;
  CREATE TRIGGER IF NOT EXISTS operator_control_command_no_delete
  BEFORE DELETE ON operator_control_commands
  BEGIN SELECT RAISE(ABORT, 'OPERATOR_CONTROL_COMMAND_IMMUTABLE'); END;

  CREATE TABLE IF NOT EXISTS operator_control_receipts (
    receipt_id TEXT PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE,
    outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'rejected')),
    result_code TEXT NOT NULL,
    evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
    receipt_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (command_id) REFERENCES operator_control_commands(command_id)
      ON DELETE RESTRICT
  );
  CREATE TRIGGER IF NOT EXISTS operator_control_receipt_immutable
  BEFORE UPDATE ON operator_control_receipts
  BEGIN SELECT RAISE(ABORT, 'OPERATOR_CONTROL_RECEIPT_IMMUTABLE'); END;
  CREATE TRIGGER IF NOT EXISTS operator_control_receipt_no_delete
  BEFORE DELETE ON operator_control_receipts
  BEGIN SELECT RAISE(ABORT, 'OPERATOR_CONTROL_RECEIPT_IMMUTABLE'); END;`);
}

module.exports = { MIGRATION_ID, migrateOperatorControlReceipts };
