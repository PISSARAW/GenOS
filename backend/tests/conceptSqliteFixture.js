'use strict';

const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

async function createDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE adaptive_state (scope TEXT, key TEXT, payload_json TEXT, version INTEGER,
      updated_at TEXT, PRIMARY KEY(scope, key));
    CREATE TABLE adaptive_state_events (scope TEXT, key TEXT, event_type TEXT,
      event_payload TEXT, created_at TEXT);
    CREATE TABLE telemetry_events (agent_id TEXT, event_type TEXT, severity TEXT,
      session_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE episodic_memories (agent_id TEXT, is_consolidated INTEGER DEFAULT 0,
      is_purged INTEGER DEFAULT 0);
  `);
  for (let index = 0; index < 50; index += 1) {
    await db.run('INSERT INTO episodic_memories (agent_id) VALUES (?)', 'a');
  }
  return db;
}

module.exports = { createDb };
