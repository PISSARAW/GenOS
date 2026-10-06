'use strict';

async function migrateGvxRuntime(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gvx_runtime_leases (
    lane TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS gvx_runtime_operations (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
      entity_id TEXT NOT NULL, agent_id TEXT NOT NULL, payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('prepared','applied','restored')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
}

module.exports = { migrateGvxRuntime };
