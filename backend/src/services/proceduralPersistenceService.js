'use strict';

const identity = require('../services/proceduralIdentityService');

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS procedural_genomes (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    parent_id TEXT,
    lineage_id TEXT,
    organism_json TEXT NOT NULL,
    structure_hash TEXT NOT NULL,
    fitness_score REAL,
    fitness_json TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    episode INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_progen_status ON procedural_genomes(status);
  CREATE INDEX IF NOT EXISTS idx_progen_lineage ON procedural_genomes(lineage_id);
  CREATE INDEX IF NOT EXISTS idx_progen_parent ON procedural_genomes(parent_id);
  CREATE INDEX IF NOT EXISTS idx_progen_org ON procedural_genomes(organization_id, project_id);
`;

async function migrateProceduralGenomes(db) {
  await db.exec(TABLE_SQL);
}

async function persistGenome(db, organism, options = {}) {
  const id = identity.assignId(organism);
  const structureHash = identity.contentHash(id);
  const fitnessScore = id.fitness?.score ?? null;
  const status = options.status || 'active';

  await db.run(
    `INSERT INTO procedural_genomes
      (id, version, parent_id, lineage_id, organism_json, structure_hash, fitness_score, fitness_json, status, episode, organization_id, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id.metadata.id,
      id.metadata.version || 1,
      id.metadata.parentId || null,
      id.metadata.lineageId || null,
      JSON.stringify(id),
      structureHash,
      fitnessScore,
      id.fitness ? JSON.stringify(id.fitness) : null,
      status,
      id.plasticity?.lastEpisode || 0,
      options.organizationId || null,
      options.projectId || null,
    ]
  );

  return id;
}

async function loadGenome(db, id) {
  const row = await db.get(
    'SELECT organism_json FROM procedural_genomes WHERE id = ?',
    id
  );
  if (!row || !row.organism_json) return null;
  return JSON.parse(row.organism_json);
}

async function listGenomesByLineage(db, lineageId, options = {}) {
  const limit = options.limit || 50;
  const rows = await db.all(
    `SELECT organism_json FROM procedural_genomes
     WHERE lineage_id = ?
     ORDER BY version ASC
     LIMIT ?`,
    [lineageId, limit]
  );
  return rows.map((r) => JSON.parse(r.organism_json));
}

async function listActiveGenomes(db, options = {}) {
  const limit = options.limit || 50;
  const rows = await db.all(
    `SELECT organism_json FROM procedural_genomes
     WHERE status = 'active'
     ORDER BY fitness_score DESC NULLS LAST
     LIMIT ?`,
    limit
  );
  return rows.map((r) => JSON.parse(r.organism_json));
}

async function updateGenomeStatus(db, id, status) {
  await db.run(
    `UPDATE procedural_genomes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, id]
  );
}

async function getPhylogeny(db, id) {
  const genomes = [];
  let current = await loadGenome(db, id);
  while (current) {
    genomes.unshift(current);
    if (current.metadata?.parentId) {
      current = await loadGenome(db, current.metadata.parentId);
    } else {
      break;
    }
  }
  return genomes;
}

module.exports = {
  migrateProceduralGenomes,
  persistGenome,
  loadGenome,
  listGenomesByLineage,
  listActiveGenomes,
  updateGenomeStatus,
  getPhylogeny,
  TABLE_SQL,
};
