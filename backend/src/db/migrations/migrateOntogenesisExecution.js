'use strict';

async function migrateOntogenesisExecution(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_execution (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id),
      task_id TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'prepared',
      pid INTEGER,
      executable TEXT NOT NULL DEFAULT '',
      worktree TEXT NOT NULL,
      base_sha TEXT NOT NULL,
      topology TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      reservation_mb REAL NOT NULL DEFAULT 0,
      budgets_json TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_onto_execution_active
      ON ontogenesis_execution(project_id)
      WHERE phase IN ('prepared', 'running', 'finished', 'verified');
    CREATE TABLE IF NOT EXISTS ontogenesis_pressure (
      project_id TEXT PRIMARY KEY,
      level TEXT NOT NULL DEFAULT 'normal',
      healthy_since INTEGER
    );
  `);
}

module.exports = { migrateOntogenesisExecution };
