async function migrateOrganismRestoreJournal(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS organism_restore_attempts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    workspace_id TEXT,
    safety_workspace_id TEXT,
    safety_workspace_hash TEXT,
    previous_checkpoints_json TEXT NOT NULL,
    target_checkpoints_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    CHECK (status IN ('pending', 'committed', 'recovered', 'blocked', 'rolled_back'))
  )`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_organism_restore_attempt_active
    ON organism_restore_attempts(agent_id) WHERE status IN ('pending', 'blocked')`);
}

module.exports = { migrateOrganismRestoreJournal };
