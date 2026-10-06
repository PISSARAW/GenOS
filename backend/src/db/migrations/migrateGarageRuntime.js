'use strict';

async function migrateGarageRuntime(db) {
  const columns = new Set((await db.all('PRAGMA table_info(garage_queue)')).map((row) => row.name));
  const additions = {
    request_hash: 'TEXT', owner_id: 'TEXT', attempts: 'INTEGER NOT NULL DEFAULT 0',
    not_before: 'TEXT', deadline_at: 'TEXT', policy_json: "TEXT NOT NULL DEFAULT '{}'",
    phase: "TEXT NOT NULL DEFAULT 'ready'", started_at: 'TEXT'
  };
  for (const [name, type] of Object.entries(additions)) {
    if (!columns.has(name)) await db.exec(`ALTER TABLE garage_queue ADD COLUMN ${name} ${type}`);
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS garage_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL, orchestrator_id TEXT NOT NULL, event_type TEXT NOT NULL,
    lease_id TEXT, payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_garage_events_request ON garage_events(request_id, sequence);
  CREATE TABLE IF NOT EXISTS garage_capsules (
    snapshot_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, worker_id TEXT NOT NULL,
    orchestrator_id TEXT NOT NULL, workspace_id TEXT, capsule_hash TEXT NOT NULL,
    state_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'frozen',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, thawed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_garage_worker_claim ON garage_queue(worker_id, status);
  CREATE INDEX IF NOT EXISTS idx_garage_ready ON garage_queue(status, phase, not_before);`);
}

module.exports = { migrateGarageRuntime };
