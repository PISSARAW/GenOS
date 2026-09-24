'use strict';

async function migrateRequestMemory(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS request_problems (
      semantic_id TEXT PRIMARY KEY,
      normalized_intent TEXT NOT NULL DEFAULT '',
      request_class TEXT NOT NULL DEFAULT 'generic',
      profile_json TEXT NOT NULL DEFAULT '{}',
      champion_result_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS request_results (
      id TEXT PRIMARY KEY,
      semantic_id TEXT NOT NULL,
      result_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PROVISIONAL'
        CHECK (status IN ('PROVISIONAL','VERIFIED','STALE','SUPERSEDED','REFUTED')),
      content_json TEXT NOT NULL DEFAULT '{}',
      evidence_json TEXT NOT NULL DEFAULT '[]',
      uncertainty_json TEXT NOT NULL DEFAULT '{}',
      dependencies_json TEXT NOT NULL DEFAULT '{}',
      execution_json TEXT NOT NULL DEFAULT '{}',
      validity_horizon_ms INTEGER,
      expires_at DATETIME,
      utility REAL DEFAULT 0.5,
      cost_json TEXT NOT NULL DEFAULT '{}',
      supersedes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (semantic_id) REFERENCES request_problems(semantic_id) ON DELETE CASCADE,
      FOREIGN KEY (supersedes) REFERENCES request_results(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_request_results_semantic
      ON request_results(semantic_id, status, result_version DESC);
    CREATE INDEX IF NOT EXISTS idx_request_results_status
      ON request_results(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_request_problems_class
      ON request_problems(request_class, updated_at DESC);
  `);
}

module.exports = { migrateRequestMemory };
