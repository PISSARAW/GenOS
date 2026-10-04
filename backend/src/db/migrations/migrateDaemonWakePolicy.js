'use strict';

async function migrateDaemonWakePolicy(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_wake_policy (
      territory_id TEXT PRIMARY KEY,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { migrateDaemonWakePolicy };
