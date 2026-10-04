'use strict';

async function migrateSignalCognitiveJobs(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS signal_cognitive_jobs (
    signal_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    signal_json TEXT NOT NULL CHECK (json_valid(signal_json)),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','completed','dead')),
    attempts INTEGER NOT NULL DEFAULT 0,
    lease_owner TEXT,
    lease_until_ms INTEGER NOT NULL DEFAULT 0,
    next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
    target_agent_id TEXT,
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    last_error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_signal_cognitive_ready ON signal_cognitive_jobs(status, next_attempt_at_ms, lease_until_ms)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_signal_cognitive_scope ON signal_cognitive_jobs(organization_id, project_id, status)');
}

module.exports = { migrateSignalCognitiveJobs };
