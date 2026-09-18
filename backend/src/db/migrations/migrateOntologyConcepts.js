'use strict';

async function migrateOntologyConcepts(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontology_continuity_observations (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, dimension TEXT NOT NULL,
      representation TEXT NOT NULL CHECK (representation IN ('continuous', 'discrete')),
      value REAL, discrete_state TEXT, thresholds_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '{}', organization_id TEXT, project_id TEXT,
      observed_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_id, dimension, observed_at)
    );
    CREATE INDEX IF NOT EXISTS idx_ontology_continuity_scope
      ON ontology_continuity_observations(organization_id, project_id, entity_id, dimension);
    CREATE TABLE IF NOT EXISTS ontology_possible_worlds (
      id TEXT PRIMARY KEY, parent_world_id TEXT, assumptions_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'hypothetical' CHECK (status IN ('hypothetical', 'simulated', 'verified')),
      evidence_json TEXT NOT NULL DEFAULT '{}', organization_id TEXT, project_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ontology_worlds_scope
      ON ontology_possible_worlds(organization_id, project_id, created_at);
    CREATE TABLE IF NOT EXISTS ontology_world_accessibility (
      source_world_id TEXT NOT NULL, target_world_id TEXT NOT NULL,
      conditions_json TEXT NOT NULL DEFAULT '[]', organization_id TEXT, project_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(source_world_id, target_world_id)
    );
  `);
}

module.exports = { migrateOntologyConcepts };
