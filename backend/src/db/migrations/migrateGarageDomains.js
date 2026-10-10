'use strict';

async function migrateGarageDomains(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS garage_domains (
    manager_id TEXT PRIMARY KEY,
    parent_manager_id TEXT,
    root_manager_id TEXT NOT NULL,
    workspace_id TEXT,
    organization_id TEXT,
    project_id TEXT,
    queue_capacity INTEGER NOT NULL DEFAULT 1000 CHECK (queue_capacity > 0),
    active_capacity INTEGER NOT NULL CHECK (active_capacity > 0),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_garage_domains_parent ON garage_domains(parent_manager_id);
  CREATE INDEX IF NOT EXISTS idx_garage_domains_scope ON garage_domains(organization_id, project_id);
  CREATE VIEW IF NOT EXISTS garage_active_reservations AS
    SELECT a.id AS worker_id, a.parent_agent_id AS manager_id,
      g.root_manager_id, g.organization_id, g.project_id,
      'active_worker' AS resource, 1 AS amount
    FROM agents a JOIN garage_domains g ON g.manager_id = a.parent_agent_id
    WHERE a.execution_mode = 'worker'
      AND (a.status = 'running'
        OR (a.status = 'blocked' AND a.current_task = 'Stopping on operator request')
        OR EXISTS (SELECT 1 FROM garage_queue q WHERE q.worker_id = a.id
          AND (q.phase IN ('freezing','freeze_failed','cancelling')
            OR (q.status IN ('claimed','running') AND q.phase = 'ready'))));`);
}

module.exports = { migrateGarageDomains };
