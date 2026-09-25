'use strict';

/**
 * Migration 046 — profil communicationnel des relations (Phase 2).
 *
 * Enrichit agent_relations (classe + propriétés mesurables) pour les
 * bases existantes. Les colonnes sont des projections indexées de
 * metadata_json, seule source de vérité lue par le service.
 */

const RELATION_COLUMNS = [
  ['relation_class', 'TEXT'],
  ['metadata_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['familiarity', 'REAL NOT NULL DEFAULT 0'],
  ['interaction_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['shared_history', 'REAL NOT NULL DEFAULT 0'],
  ['authority', 'REAL NOT NULL DEFAULT 0'],
  ['trust_for_domain', 'REAL NOT NULL DEFAULT 0'],
  ['common_ground_estimate', 'REAL NOT NULL DEFAULT 0'],
  ['epistemic_independence', 'REAL NOT NULL DEFAULT 1'],
  ['error_correlation', 'REAL NOT NULL DEFAULT 0'],
  ['disclosure_level', 'REAL NOT NULL DEFAULT 1'],
  ['preferred_dialect', 'TEXT'],
  ['last_interaction', 'TEXT']
];

async function migrateRelationCommunicationProfile(db) {
  const columns = await db.all('PRAGMA table_info(agent_relations)');
  const names = new Set((columns || []).map((col) => col.name));
  for (const [name, type] of RELATION_COLUMNS) {
    if (!names.has(name)) {
      await db.exec(`ALTER TABLE agent_relations ADD COLUMN ${name} ${type}`);
    }
  }
  await db.exec('CREATE INDEX IF NOT EXISTS idx_agent_relations_class ON agent_relations(relation_class)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_agent_relations_familiarity ON agent_relations(familiarity)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_agent_relations_epistemic ON agent_relations(epistemic_independence)');
}

module.exports = { migrateRelationCommunicationProfile };
