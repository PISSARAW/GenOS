'use strict';

async function migrateTrajectoryStewardships(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_stewardship_responsibilities (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      responsibility_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      mandate_ref TEXT NOT NULL,
      objective_ref TEXT NOT NULL,
      observation_ref TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('ACT','OBSERVE','LEARN')),
      domains_json TEXT NOT NULL,
      decision_hash TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, responsibility_id),
      UNIQUE(organization_id, project_id, goal_id),
      UNIQUE(organization_id, project_id, receipt_id)
    );
    CREATE INDEX IF NOT EXISTS idx_trajectory_stewardship_owner
      ON trajectory_stewardship_responsibilities(
        organization_id, project_id, agent_id, created_at DESC);
    CREATE TRIGGER IF NOT EXISTS trajectory_stewardship_responsibility_no_update
      BEFORE UPDATE ON trajectory_stewardship_responsibilities
      BEGIN SELECT RAISE(ABORT, 'Trajectory stewardship responsibilities are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS trajectory_stewardship_responsibility_no_delete
      BEFORE DELETE ON trajectory_stewardship_responsibilities
      BEGIN SELECT RAISE(ABORT, 'Trajectory stewardship responsibilities are append-only'); END;
  `);
}

module.exports = { migrateTrajectoryStewardships };
