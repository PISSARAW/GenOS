async function migrateOrganismModelTurns(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS organism_model_turns (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    organization_id TEXT,
    project_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    request_json TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_json TEXT,
    response_hash TEXT,
    error_code TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_organism_model_turns_agent
    ON organism_model_turns(agent_id, created_at, id);`);
}

module.exports = { migrateOrganismModelTurns };
