'use strict';

/**
 * Migration 092 — résumés de compaction mémoire (roadmap §P4).
 * Les entrées compactées sont remplacées par un résumé extractif
 * déterministe (aucun modèle requis), avec provenance conservée.
 */

async function migrateOntogenesisSummaries(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      covers_from TEXT,
      covers_to TEXT,
      entry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onto_summaries_project
      ON ontogenesis_summaries(project_id, created_at);
  `);
}

module.exports = { migrateOntogenesisSummaries };
