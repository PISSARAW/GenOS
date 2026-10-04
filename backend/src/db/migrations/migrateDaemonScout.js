'use strict';

async function migrateDaemonScout(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_scout_colonies (
      id TEXT PRIMARY KEY,
      daemon_id TEXT NOT NULL,
      territory_id TEXT NOT NULL,
      observation_goal TEXT NOT NULL,
      partition_strategy TEXT NOT NULL,
      max_cells INTEGER NOT NULL,
      budget INTEGER NOT NULL,
      ttl_ms INTEGER NOT NULL,
      llm_ratio REAL NOT NULL,
      state TEXT NOT NULL,
      cell_ids TEXT NOT NULL DEFAULT '[]',
      findings TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      dissolved_at TEXT,
      dissolve_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scout_colonies_territory ON daemon_scout_colonies(territory_id);
    CREATE INDEX IF NOT EXISTS idx_scout_colonies_expires ON daemon_scout_colonies(expires_at);

    CREATE TABLE IF NOT EXISTS daemon_scout_cells (
      id TEXT PRIMARY KEY,
      colony_id TEXT NOT NULL,
      territory_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      scope TEXT,
      state TEXT NOT NULL,
      head_sha TEXT,
      findings TEXT NOT NULL DEFAULT '[]',
      provenance_record_ids TEXT NOT NULL DEFAULT '[]',
      tokens_used INTEGER NOT NULL DEFAULT 0,
      analysis_type TEXT,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY(colony_id) REFERENCES daemon_scout_colonies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_scout_cells_colony ON daemon_scout_cells(colony_id);
  `);
}

module.exports = { migrateDaemonScout };