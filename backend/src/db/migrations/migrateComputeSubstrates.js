'use strict';

/**
 * Migration 067 — compute substrates registry.
 *
 * Table compute_substrates:
 *   Tracks available execution substrates (CPU, GPU, VFS workers,
 *   CPU solver, remote model, QPU), their capabilities (operation types
 *   they handle), current load, and cost-per-op for dynamic scheduling
 *   by the ComputeSubstrateResolver.
 */

async function migrateComputeSubstrates(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS compute_substrates (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      current_load INTEGER NOT NULL DEFAULT 0,
      max_scale INTEGER NOT NULL DEFAULT 100,
      cost_per_op REAL NOT NULL DEFAULT 0.01,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'offline')),
      last_health_check DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_compute_substrates_status ON compute_substrates(status);
    CREATE INDEX IF NOT EXISTS idx_compute_substrates_load ON compute_substrates(status, current_load, max_scale);
  `);
}

module.exports = { migrateComputeSubstrates };
