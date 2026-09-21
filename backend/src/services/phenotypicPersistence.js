'use strict';

/**
 * @file phenotypicPersistence.js
 * @description Persistance du phénotype avec la nouvelle table agent_phenotype_states.
 */

async function getDb() {
  const { getDatabase } = require('../db');
  return getDatabase();
}

/**
 * Sauvegarde l'état phénotypique.
 * Utilise la nouvelle structure (branches_json, atrophies_json, history_json).
 */
async function savePhenotypeState(state) {
  const db = await getDb();
  const id = state.id || `pheno_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await db.run(
    `INSERT INTO agent_phenotype_states (id, genome_id, branches_json, atrophies_json, history_json, strength, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       branches_json = excluded.branches_json,
       atrophies_json = excluded.atrophies_json,
       history_json = excluded.history_json,
       strength = excluded.strength,
       updated_at = excluded.updated_at`,
    id,
    state.genomeId || state.genome_id || 'unknown',
    JSON.stringify(state.branches || []),
    JSON.stringify(state.atrophies || []),
    JSON.stringify(state.history || []),
    state.strength || 0.5,
    state.createdAt || new Date().toISOString(),
    new Date().toISOString()
  );

  return id;
}

/**
 * Charge l'état phénotypique le plus récent.
 */
async function loadPhenotypeState(genomeId) {
  const db = await getDb();
  const row = await db.get(
    `SELECT id, genome_id, branches_json, atrophies_json, history_json, strength, created_at, updated_at
     FROM agent_phenotype_states
     WHERE genome_id = ?
     ORDER BY updated_at DESC LIMIT 1`,
    genomeId
  );

  if (!row) return null;

  return {
    id: row.id,
    genomeId: row.genome_id,
    branches: JSON.parse(row.branches_json || '[]'),
    atrophies: JSON.parse(row.atrophies_json || '[]'),
    history: JSON.parse(row.history_json || '[]'),
    strength: row.strength || 0.5,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  savePhenotypeState,
  loadPhenotypeState,
};
