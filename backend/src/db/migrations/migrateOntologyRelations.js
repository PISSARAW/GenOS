'use strict';

async function createOntologyRelationTables(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS ontology_relations (
    id TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    provenance_json TEXT NOT NULL DEFAULT '{}',
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_kind, source_id, relation_type, target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS idx_ontology_rel_source
  ON ontology_relations(source_kind, source_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_ontology_rel_target
  ON ontology_relations(target_kind, target_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_ontology_rel_type
  ON ontology_relations(relation_type);
  `);
}

module.exports = { createOntologyRelationTables };
