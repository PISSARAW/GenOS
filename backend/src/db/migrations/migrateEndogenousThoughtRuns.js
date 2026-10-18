'use strict';

async function migrateEndogenousThoughtRuns(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS endogenous_thought_runs (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      binding_ref TEXT NOT NULL,
      authorization_ref TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status = 'completed_unverified'),
      completed_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id, project_id, run_id),
      UNIQUE(organization_id, project_id, episode_id),
      UNIQUE(organization_id, project_id, task_id),
      UNIQUE(organization_id, project_id, receipt_id),
      FOREIGN KEY(organization_id, project_id, episode_id)
        REFERENCES endogenous_thought_episodes(organization_id, project_id, episode_id)
        ON DELETE RESTRICT,
      FOREIGN KEY(task_id) REFERENCES ontogenesis_backlog(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_endogenous_run_episode
      ON endogenous_thought_runs(
        organization_id, project_id, episode_id, completed_at DESC);
    CREATE TRIGGER IF NOT EXISTS endogenous_run_no_update
      BEFORE UPDATE ON endogenous_thought_runs
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought runs are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS endogenous_run_no_delete
      BEFORE DELETE ON endogenous_thought_runs
      BEGIN SELECT RAISE(ABORT, 'Endogenous thought runs are durable evidence'); END;
  `);
}

module.exports = { migrateEndogenousThoughtRuns };
