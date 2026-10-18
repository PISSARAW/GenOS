'use strict';

const { withTransaction } = require('../../db');

async function migrateGqwf(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gqwf_roots (
      workspace_id TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, root_hash),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS gqwf_views (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      base_hash TEXT NOT NULL,
      overlay_version INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, base_hash) REFERENCES gqwf_roots(workspace_id, root_hash)
    );
    CREATE TABLE IF NOT EXISTS gqwf_changes (
      view_id TEXT NOT NULL,
      path TEXT NOT NULL,
      blob_hash TEXT,
      size INTEGER,
      mode INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
      PRIMARY KEY (view_id, path),
      FOREIGN KEY (view_id) REFERENCES gqwf_views(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS gqwf_heads (
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      generation INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, name),
      FOREIGN KEY (workspace_id, root_hash) REFERENCES gqwf_roots(workspace_id, root_hash)
    );
    CREATE TABLE IF NOT EXISTS gqwf_leases (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      path TEXT NOT NULL,
      execution_path TEXT,
      status TEXT NOT NULL CHECK (status IN ('preparing', 'open', 'ingested', 'releasing', 'released', 'quarantined')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, root_hash) REFERENCES gqwf_roots(workspace_id, root_hash)
    );
    CREATE TABLE IF NOT EXISTS gqwf_execution_sessions (
      execution_run_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      view_id TEXT NOT NULL UNIQUE,
      lease_id TEXT UNIQUE,
      base_hash TEXT NOT NULL,
      candidate_hash TEXT,
      source_path TEXT NOT NULL,
      materialized_path TEXT,
      status TEXT NOT NULL CHECK (status IN ('virtual', 'materialized', 'ingested', 'released')),
      outcome TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, base_hash) REFERENCES gqwf_roots(workspace_id, root_hash),
      FOREIGN KEY (view_id) REFERENCES gqwf_views(id),
      FOREIGN KEY (lease_id) REFERENCES gqwf_leases(id)
    );
    CREATE TABLE IF NOT EXISTS gqwf_head_events (
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      generation INTEGER NOT NULL,
      previous_hash TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, name, generation)
    );
    CREATE TABLE IF NOT EXISTS gqwf_legacy_links (
      workspace_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      legacy_hash TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, snapshot_id),
      FOREIGN KEY (workspace_id, root_hash) REFERENCES gqwf_roots(workspace_id, root_hash)
    );
    CREATE TABLE IF NOT EXISTS gqwf_worker_bindings (
      worker_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      capsule_path TEXT NOT NULL,
      base_hash TEXT NOT NULL,
      view_id TEXT NOT NULL UNIQUE,
      lease_id TEXT UNIQUE,
      backend TEXT NOT NULL DEFAULT 'physical' CHECK (backend IN ('physical', 'gqwf')),
      candidate_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'captured', 'capture_failed', 'released', 'discarded')),
      outcome TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, base_hash) REFERENCES gqwf_roots(workspace_id, root_hash),
      FOREIGN KEY (view_id) REFERENCES gqwf_views(id),
      FOREIGN KEY (lease_id) REFERENCES gqwf_leases(id)
    );
    CREATE INDEX IF NOT EXISTS idx_gqwf_views_workspace ON gqwf_views(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_gqwf_execution_workspace_status
      ON gqwf_execution_sessions(workspace_id, status);
    CREATE TABLE IF NOT EXISTS gqwf_rollout_decisions (
      execution_run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      project_id TEXT,
      policy_id TEXT NOT NULL,
      basis_hash TEXT NOT NULL,
      basis_points INTEGER NOT NULL CHECK (basis_points BETWEEN 1 AND 10000),
      bucket INTEGER NOT NULL CHECK (bucket BETWEEN 0 AND 9999),
      arm TEXT NOT NULL CHECK (arm IN ('control', 'canary')),
      disabled_reason TEXT,
      status TEXT NOT NULL CHECK (status IN ('assigned', 'prepared', 'completed', 'failed')),
      outcome TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_gqwf_rollout_workspace_policy
      ON gqwf_rollout_decisions(workspace_id, policy_id, created_at);
    CREATE TABLE IF NOT EXISTS gqwf_materialization_receipts (
      lease_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      backend_id TEXT NOT NULL,
      contract_version INTEGER NOT NULL,
      capabilities_json TEXT NOT NULL,
      capability_hash TEXT NOT NULL,
      selection_reason TEXT NOT NULL,
      receipt_hash TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_gqwf_materialization_workspace_backend
      ON gqwf_materialization_receipts(workspace_id, backend_id, created_at);
  `);
  const row = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'gqwf_leases'");
  if (!row.sql.includes("'preparing'")) await migrateLeaseStatus(db);
  await ensureLeaseExecutionPath(db);
  const worker = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'gqwf_worker_bindings'");
  if (!worker.sql.includes('lease_id') || !worker.sql.includes("'discarded'")) await migrateWorkerBindings(db);
  await createWorkerPromotionTable(db);
  await createGarbageCollectionTable(db);
  await createIntegrityRunTable(db);
  await createReplicationReceiptTable(db);
}

async function migrateLeaseStatus(db) {
  const columns = await db.all('PRAGMA table_info(gqwf_leases)');
  const executionSource = columns.some((column) => column.name === 'execution_path')
    ? 'COALESCE(execution_path, path)' : 'path';
  await withTransaction(db, async () => {
    await db.exec('ALTER TABLE gqwf_leases RENAME TO gqwf_leases_previous;');
    await db.exec(`CREATE TABLE gqwf_leases (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      path TEXT NOT NULL,
      execution_path TEXT,
      status TEXT NOT NULL CHECK (status IN ('preparing', 'open', 'ingested', 'releasing', 'released', 'quarantined')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, root_hash) REFERENCES gqwf_roots(workspace_id, root_hash)
    );`);
    await db.exec(`INSERT INTO gqwf_leases
      (id, workspace_id, root_hash, path, execution_path, status, created_at)
      SELECT id, workspace_id, root_hash, path, ${executionSource},
        CASE status WHEN 'released' THEN 'releasing' ELSE status END,
        created_at FROM gqwf_leases_previous;`);
    await db.exec('DROP TABLE gqwf_leases_previous;');
  });
}

async function ensureLeaseExecutionPath(db) {
  const columns = await db.all('PRAGMA table_info(gqwf_leases)');
  if (!columns.some((column) => column.name === 'execution_path')) {
    await db.exec('ALTER TABLE gqwf_leases ADD COLUMN execution_path TEXT;');
  }
  await db.run('UPDATE gqwf_leases SET execution_path = path WHERE execution_path IS NULL');
}

async function migrateWorkerBindings(db) {
  await withTransaction(db, async () => {
    await db.exec('ALTER TABLE gqwf_worker_bindings RENAME TO gqwf_worker_bindings_previous;');
    await db.exec(`CREATE TABLE gqwf_worker_bindings (
      worker_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      capsule_path TEXT NOT NULL,
      base_hash TEXT NOT NULL,
      view_id TEXT NOT NULL UNIQUE,
      lease_id TEXT UNIQUE,
      backend TEXT NOT NULL DEFAULT 'physical' CHECK (backend IN ('physical', 'gqwf')),
      candidate_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'captured', 'capture_failed', 'released', 'discarded')),
      outcome TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, base_hash) REFERENCES gqwf_roots(workspace_id, root_hash),
      FOREIGN KEY (view_id) REFERENCES gqwf_views(id),
      FOREIGN KEY (lease_id) REFERENCES gqwf_leases(id)
    );`);
    await db.exec(`INSERT INTO gqwf_worker_bindings
      (worker_id, workspace_id, capsule_path, base_hash, view_id, candidate_hash, status, error, created_at)
      SELECT worker_id, workspace_id, capsule_path, base_hash, view_id, candidate_hash, status, error, created_at
      FROM gqwf_worker_bindings_previous;`);
    await db.exec('DROP TABLE gqwf_worker_bindings_previous;');
  });
}

async function createWorkerPromotionTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gqwf_worker_promotions (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    view_id TEXT NOT NULL,
    head_name TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    candidate_hash TEXT NOT NULL,
    expected_generation INTEGER NOT NULL,
    published_generation INTEGER NOT NULL,
    evidence_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (worker_id, head_name, candidate_hash, evidence_id),
    FOREIGN KEY (worker_id) REFERENCES gqwf_worker_bindings(worker_id),
    FOREIGN KEY (view_id) REFERENCES gqwf_views(id),
    FOREIGN KEY (workspace_id, candidate_hash) REFERENCES gqwf_roots(workspace_id, root_hash)
  );`);
}

async function createGarbageCollectionTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gqwf_gc_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    inventory_hash TEXT NOT NULL,
    root_count INTEGER NOT NULL,
    blob_count INTEGER NOT NULL,
    overlay_cache_count INTEGER NOT NULL DEFAULT 0,
    reclaimed_bytes INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );`);
  const columns = await db.all('PRAGMA table_info(gqwf_gc_runs)');
  if (!columns.some((column) => column.name === 'overlay_cache_count')) {
    await db.exec(`ALTER TABLE gqwf_gc_runs
      ADD COLUMN overlay_cache_count INTEGER NOT NULL DEFAULT 0;`);
  }
}

async function createIntegrityRunTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gqwf_integrity_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    protocol TEXT NOT NULL,
    inventory_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'corrupt')),
    root_count INTEGER NOT NULL,
    blob_count INTEGER NOT NULL,
    issue_count INTEGER NOT NULL,
    report_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_gqwf_integrity_workspace_created
    ON gqwf_integrity_runs(workspace_id, created_at);`);
}

async function createReplicationReceiptTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gqwf_replication_receipts (
    id TEXT PRIMARY KEY,
    source_workspace_id TEXT NOT NULL,
    target_workspace_id TEXT NOT NULL,
    root_hash TEXT NOT NULL,
    plan_hash TEXT NOT NULL,
    receipt_hash TEXT NOT NULL UNIQUE,
    receipt_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_workspace_id, target_workspace_id, root_hash, plan_hash),
    FOREIGN KEY (source_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (target_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (target_workspace_id, root_hash)
      REFERENCES gqwf_roots(workspace_id, root_hash) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_gqwf_replication_target_created
    ON gqwf_replication_receipts(target_workspace_id, created_at);`);
}

module.exports = { migrateGqwf };
