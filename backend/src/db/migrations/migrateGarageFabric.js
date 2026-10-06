async function migrateGarageFabric(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS garage_queue (
    request_id TEXT PRIMARY KEY,
    orchestrator_id TEXT NOT NULL,
    worker_id TEXT,
    organization_id TEXT,
    project_id TEXT,
    mode TEXT NOT NULL DEFAULT 'surface',
    priority REAL NOT NULL DEFAULT 0.5,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'running', 'completed', 'cancelled', 'failed', 'expired')),
    request_json TEXT NOT NULL DEFAULT '{}',
    lease_id TEXT,
    lease_expires_at DATETIME,
    snapshot_id TEXT,
    result_json TEXT,
    error_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_garage_queue_dispatch ON garage_queue(orchestrator_id, status, priority DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_garage_queue_lease ON garage_queue(status, lease_expires_at);
  CREATE INDEX IF NOT EXISTS idx_garage_queue_scope ON garage_queue(organization_id, project_id);`);
  await require('./migrateGarageRuntime').migrateGarageRuntime(db);
}

module.exports = { migrateGarageFabric };
