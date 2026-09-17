'use strict';

async function createPhilosophyAnalysisTables(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS philosophy_analyses (
    id TEXT PRIMARY KEY,
    concept_id TEXT NOT NULL,
    input_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT NOT NULL DEFAULT '{}',
    provenance_json TEXT NOT NULL DEFAULT '{}',
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_philosophy_analyses_concept
  ON philosophy_analyses(concept_id, created_at);
CREATE INDEX IF NOT EXISTS idx_philosophy_analyses_creator
  ON philosophy_analyses(created_by, created_at);
  `);
}

module.exports = { createPhilosophyAnalysisTables };
