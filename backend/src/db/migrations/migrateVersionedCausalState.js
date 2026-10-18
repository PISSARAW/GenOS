'use strict';

async function migrateVersionedCausalState(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS causal_state_branches (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    parent_branch_id TEXT,
    fork_snapshot_id TEXT,
    head_snapshot_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('active','closed','quarantined')),
    purpose TEXT NOT NULL,
    intervention_json TEXT NOT NULL,
    authority_hash TEXT NOT NULL,
    authority_ref_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(run_id) REFERENCES strategy_execution_runs(id),
    FOREIGN KEY(parent_branch_id) REFERENCES causal_state_branches(id)
  );
  CREATE INDEX IF NOT EXISTS idx_causal_state_branches_run
    ON causal_state_branches(run_id, created_at);

  CREATE TABLE IF NOT EXISTS causal_state_snapshots (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    parent_snapshot_id TEXT,
    sequence INTEGER NOT NULL CHECK(sequence >= 0),
    state_json TEXT NOT NULL,
    state_hash TEXT NOT NULL,
    transition_json TEXT NOT NULL,
    transition_hash TEXT NOT NULL,
    authority_hash TEXT NOT NULL,
    snapshot_seal TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(branch_id, sequence),
    FOREIGN KEY(run_id) REFERENCES strategy_execution_runs(id),
    FOREIGN KEY(branch_id) REFERENCES causal_state_branches(id),
    FOREIGN KEY(parent_snapshot_id) REFERENCES causal_state_snapshots(id)
  );
  CREATE INDEX IF NOT EXISTS idx_causal_state_snapshots_parent
    ON causal_state_snapshots(parent_snapshot_id);

  CREATE TABLE IF NOT EXISTS causal_state_replay_receipts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    from_snapshot_id TEXT NOT NULL,
    to_snapshot_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('verified','refused')),
    reason TEXT,
    receipt_json TEXT NOT NULL,
    receipt_hash TEXT NOT NULL,
    authority_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(run_id) REFERENCES strategy_execution_runs(id),
    FOREIGN KEY(branch_id) REFERENCES causal_state_branches(id)
  );
  CREATE INDEX IF NOT EXISTS idx_causal_state_replays_run
    ON causal_state_replay_receipts(run_id, created_at);

  CREATE TRIGGER IF NOT EXISTS causal_state_branches_identity_no_update
    BEFORE UPDATE OF id, run_id, agent_id, parent_branch_id, fork_snapshot_id,
      purpose, intervention_json, authority_hash, authority_ref_json
    ON causal_state_branches
    BEGIN SELECT RAISE(ABORT, 'causal branch identity is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS causal_state_branches_no_delete
    BEFORE DELETE ON causal_state_branches
    BEGIN SELECT RAISE(ABORT, 'causal state branches are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS causal_state_snapshots_no_update
    BEFORE UPDATE ON causal_state_snapshots
    BEGIN SELECT RAISE(ABORT, 'causal state snapshots are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS causal_state_snapshots_no_delete
    BEFORE DELETE ON causal_state_snapshots
    BEGIN SELECT RAISE(ABORT, 'causal state snapshots are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS causal_state_replays_no_update
    BEFORE UPDATE ON causal_state_replay_receipts
    BEGIN SELECT RAISE(ABORT, 'causal replay receipts are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS causal_state_replays_no_delete
    BEFORE DELETE ON causal_state_replay_receipts
    BEGIN SELECT RAISE(ABORT, 'causal replay receipts are immutable'); END;`);
}

module.exports = { migrateVersionedCausalState };
