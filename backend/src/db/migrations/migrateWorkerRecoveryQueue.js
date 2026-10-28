'use strict';

async function migrateWorkerRecoveryQueue(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS worker_recovery_queue (
    recovery_key TEXT PRIMARY KEY, worker_id TEXT NOT NULL, mission_id TEXT NOT NULL,
    payload_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','claimed','retry','cancelled','exhausted','dispatched')),
    attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL,
    claim_token TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE INDEX IF NOT EXISTS idx_worker_recovery_queue_status ON worker_recovery_queue(status, updated_at);`);
  const columns = new Set((await db.all('PRAGMA table_info(worker_recovery_queue)')).map((row) => row.name));
  if (!columns.has('claim_expires_at')) await db.exec('ALTER TABLE worker_recovery_queue ADD COLUMN claim_expires_at TEXT');
  if (!columns.has('claim_owner_pid')) await db.exec('ALTER TABLE worker_recovery_queue ADD COLUMN claim_owner_pid INTEGER');
}

module.exports = { migrateWorkerRecoveryQueue };
