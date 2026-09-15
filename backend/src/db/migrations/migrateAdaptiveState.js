'use strict';

const TABLE = 'adaptive_state';

async function migrateAdaptiveState(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scope, key),
    CHECK (json_valid(payload_json))
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_adaptive_state_scope ON ${TABLE}(scope, updated_at)`);
  await db.exec(`CREATE TABLE IF NOT EXISTS adaptive_state_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_payload TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_adaptive_state_events_scope ON adaptive_state_events(scope, created_at)`);
}

module.exports = { migrateAdaptiveState };
