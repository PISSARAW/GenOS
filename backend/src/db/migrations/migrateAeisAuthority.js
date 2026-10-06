'use strict';

async function migrateAeisAuthority(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS aeis_agent_dissonance (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    dissonance REAL NOT NULL DEFAULT 0 CHECK(dissonance >= 0),
    authority_level INTEGER NOT NULL DEFAULT 0 CHECK(authority_level BETWEEN 0 AND 4),
    autopsy_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS aeis_dissonance_events (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, delta REAL NOT NULL CHECK(delta >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(agent_id, event_id)
  );`);
}

module.exports = { migrateAeisAuthority };
