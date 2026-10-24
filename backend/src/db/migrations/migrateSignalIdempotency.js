'use strict';

async function migrateSignalIdempotency(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS signal_idempotency_keys (
    key_hash TEXT PRIMARY KEY,
    signal_id TEXT NOT NULL UNIQUE,
    sender_agent_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

module.exports = { migrateSignalIdempotency };
