'use strict';

async function migrateNcePlayObservations(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS nce_play_observations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    command TEXT NOT NULL,
    observation_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nce_play_agent ON nce_play_observations(agent_id, created_at);`);
}

module.exports = { migrateNcePlayObservations };
