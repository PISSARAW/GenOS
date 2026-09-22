'use strict';

async function migrateMissionOrganismState(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_organism_state (
    organism_id TEXT PRIMARY KEY,
    genome_json TEXT NOT NULL,
    phenotype_json TEXT NOT NULL,
    tissues_json TEXT NOT NULL,
    metabolism_json TEXT NOT NULL,
    immune_system_json TEXT NOT NULL,
    nervous_system_json TEXT NOT NULL,
    memory_json TEXT NOT NULL,
    survival_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_mission_organism_state_organism
    ON mission_organism_state(organism_id);
  `);
}

module.exports = { migrateMissionOrganismState };