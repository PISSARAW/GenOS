'use strict';

async function migrateOntogenesisMemorySearch(db) {
  await db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ontogenesis_memory_fts USING fts5(
      memory_id UNINDEXED,
      project_id UNINDEXED,
      kind UNINDEXED,
      content,
      tokenize = 'porter unicode61'
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_memory_synapses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, source_id, target_id)
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_onto_mem_synapses_project
      ON ontogenesis_memory_synapses(project_id, weight);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_onto_mem_synapses_source
      ON ontogenesis_memory_synapses(project_id, source_id);
  `);
}

module.exports = { migrateOntogenesisMemorySearch };