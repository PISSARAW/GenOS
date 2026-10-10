'use strict';

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
      status TEXT NOT NULL CHECK (status IN ('open', 'ingested', 'released')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, root_hash) REFERENCES gqwf_roots(workspace_id, root_hash)
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
      candidate_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'captured', 'capture_failed')),
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, base_hash) REFERENCES gqwf_roots(workspace_id, root_hash),
      FOREIGN KEY (view_id) REFERENCES gqwf_views(id)
    );
    CREATE INDEX IF NOT EXISTS idx_gqwf_views_workspace ON gqwf_views(workspace_id);
  `);
}

module.exports = { migrateGqwf };
