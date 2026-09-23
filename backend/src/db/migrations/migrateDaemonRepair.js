'use strict';

/**
 * Migration 049 — repair episodes daemon (ADR 0034 D14).
 *
 * Un RepairEpisode est une capsule de réparation isolée, ouverte
 * par le daemon résident sur un finding REPAIRABLE et exécutée
 * par un worker — jamais par le daemon lui-même. Le daemon
 * observe et connaît ; le worker intervient. La lease est
 * temporaire, scopée, budgétée : elle ne devient jamais un
 * droit implicite (pas de WRITE/COMMIT/PUSH pour le daemon).
 */

async function migrateDaemonRepair(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_repair_episodes (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      finding_id TEXT NOT NULL UNIQUE,
      head_sha TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'EXPIRED')),
      lease_json TEXT NOT NULL DEFAULT '{}',
      branch_name TEXT NOT NULL,
      worker_id TEXT,
      workspace_path TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_repair_episodes_territory
      ON daemon_repair_episodes(territory_id, status);
    CREATE INDEX IF NOT EXISTS idx_repair_episodes_finding
      ON daemon_repair_episodes(finding_id);
  `);
}

module.exports = { migrateDaemonRepair };
