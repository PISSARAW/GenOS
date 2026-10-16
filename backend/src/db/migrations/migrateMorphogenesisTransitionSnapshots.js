'use strict';

async function migrateMorphogenesisTransitionSnapshots(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS morphogenesis_transition_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      transition_id TEXT NOT NULL UNIQUE,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      plan_hash TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN
        ('prepared','applying','committed','restoring','restored','recovery_required')),
      authority_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_morphogenesis_transition_scope
      ON morphogenesis_transition_snapshots(organization_id, project_id, mission_id, status);
    CREATE TABLE IF NOT EXISTS morphogenesis_transition_actions (
      transition_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(transition_id, sequence),
      FOREIGN KEY(transition_id) REFERENCES morphogenesis_transition_snapshots(transition_id)
        ON DELETE RESTRICT
    );
    CREATE TRIGGER IF NOT EXISTS morphogenesis_transition_snapshot_immutable
      BEFORE UPDATE OF transition_id, organization_id, project_id, mission_id, principal_id,
        plan_hash, snapshot_hash, payload_json ON morphogenesis_transition_snapshots
      BEGIN SELECT RAISE(ABORT, 'Morphogenesis transition snapshot payload is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morphogenesis_transition_snapshot_no_delete
      BEFORE DELETE ON morphogenesis_transition_snapshots
      BEGIN SELECT RAISE(ABORT, 'Morphogenesis transition snapshots are durable evidence'); END;
    CREATE TRIGGER IF NOT EXISTS morphogenesis_transition_action_no_update
      BEFORE UPDATE ON morphogenesis_transition_actions
      BEGIN SELECT RAISE(ABORT, 'Morphogenesis transition actions are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS morphogenesis_transition_action_no_delete
      BEFORE DELETE ON morphogenesis_transition_actions
      BEGIN SELECT RAISE(ABORT, 'Morphogenesis transition actions are durable evidence'); END;
  `);
}

module.exports = { migrateMorphogenesisTransitionSnapshots };
