'use strict';

async function migrateSignalDispatch(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS signal_dispatch_jobs (
    signal_id TEXT PRIMARY KEY, signal_json TEXT NOT NULL CHECK(json_valid(signal_json)),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','completed','dead')),
    attempts INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until_ms INTEGER NOT NULL DEFAULT 0,
    next_attempt_at_ms INTEGER NOT NULL DEFAULT 0, result_json TEXT, last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_signal_dispatch_ready
    ON signal_dispatch_jobs(status, next_attempt_at_ms, lease_until_ms);
  CREATE TABLE IF NOT EXISTS signal_receptor_actions (
    signal_id TEXT NOT NULL, receptor_id TEXT NOT NULL, receptor_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','running','completed','failed','uncertain')),
    lease_owner TEXT, lease_until_ms INTEGER NOT NULL DEFAULT 0, result_json TEXT,
    PRIMARY KEY(signal_id, receptor_id)
  );`);
}

module.exports = { migrateSignalDispatch };
