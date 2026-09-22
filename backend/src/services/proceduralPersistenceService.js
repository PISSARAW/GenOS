'use strict';

const identity = require('./proceduralIdentityService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS procedural_genomes (
    version_id TEXT PRIMARY KEY,
    structure_hash TEXT NOT NULL,
    state_hash TEXT NOT NULL,
    parent_version_id TEXT,
    lineage_id TEXT,
    organism_json TEXT NOT NULL,
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
  CREATE INDEX IF NOT EXISTS idx_progen_parent ON procedural_genomes(parent_version_id);
  CREATE INDEX IF NOT EXISTS idx_progen_structure ON procedural_genomes(structure_hash);
  CREATE INDEX IF NOT EXISTS idx_progen_org ON procedural_genomes(organization_id, project_id);
`;

async function migrateProceduralGenomes(db) {
  const statements = TABLE_SQL.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    await run(db, stmt);
  }
}

async function persistGenome(db, organism, options = {}) {
  // Validate basic required fields (early return pattern)
  if (!organism.apiVersion) {
    throw new Error('missing apiVersion');
  }
  if (!organism.kind) {
    throw new Error('missing kind');
  }
  if (!organism.metadata) {
    throw new Error('missing metadata');
  }
  
  // Phase 1: Compute hashes and versionId first
  const structureHash = identity.structureHash(organism);
  const stateHash = identity.stateHash(organism);
  const versionId = identity.versionId(organism);
  const fitnessScore = organism.fitness != null ? organism.fitness.score : null;
  const status = options.status || 'active';

  // Phase 2: Build toSave with canonical metadata
  const toSave = {
    ...organism,
    metadata: {
      ...(organism.metadata || {}),
      id: versionId,
      structureHash,
      stateHash
    },
  };

  // Phase 3: Validate canonical persisted organism
  identity.validateProceduralOrganism(toSave);

  await run(
    db,
    `INSERT INTO procedural_genomes
      (version_id, structure_hash, state_hash, parent_version_id, lineage_id, organism_json, fitness_score, fitness_json, status, episode, organization_id, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      versionId,
      structureHash,
      stateHash,
      organism.metadata?.parentId || null,
      organism.metadata?.lineageId || null,
      JSON.stringify(toSave),
      fitnessScore,
      organism.fitness ? JSON.stringify(organism.fitness) : null,
      status,
      organism.plasticity?.lastEpisode || 0,
      options.organizationId || null,
      options.projectId || null,
    ]
  );

  return toSave;
}

async function loadGenome(db, versionId) {
  const row = await get(
    db,
    'SELECT organism_json FROM procedural_genomes WHERE version_id = ?',
    versionId
  );
  if (!row || !row.organism_json) return null;
  return JSON.parse(row.organism_json);
}

async function listGenomesByLineage(db, lineageId, options = {}) {
  const limit = options.limit || 50;
  const rows = await all(
    db,
    `SELECT organism_json FROM procedural_genomes
     WHERE lineage_id = ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [lineageId, limit]
  );
  return rows.map((r) => JSON.parse(r.organism_json));
}

async function listActiveGenomes(db, options = {}) {
  const limit = options.limit || 50;
  const rows = await all(
    db,
    `SELECT organism_json, version_id FROM procedural_genomes
     WHERE status = 'active'
     ORDER BY fitness_score DESC NULLS LAST
     LIMIT ?`,
    limit
  );
  return rows.map((r) => JSON.parse(r.organism_json));
}

async function updateGenomeStatus(db, versionId, status) {
  await run(
    db,
    `UPDATE procedural_genomes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE version_id = ?`,
    [status, versionId]
  );
}

async function getPhylogeny(db, versionId) {
  const genomes = [];
  let current = await loadGenome(db, versionId);
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
  run,
  get,
  all,
};
