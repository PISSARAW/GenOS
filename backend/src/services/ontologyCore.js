'use strict';

/**
 * Ontology Core — Being, Substance, Essence.
 */

const { getDatabase } = require('../db');
const crypto = require('crypto');

const SUBSTANCE_TYPES = [
  'agent', 'worker', 'orchestrator', 'capsule', 'workspace', 'mission', 'tool', 'model',
  'runtime', 'species', 'monad', 'cogitans', 'extensa'
];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

function hashEssence(essence) {
  const str = typeof essence === 'string' ? essence : JSON.stringify(essence, Object.keys(essence).sort());
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function validateSubstanceType(substanceType) {
  if (!SUBSTANCE_TYPES.includes(substanceType)) {
    throw new Error(`Invalid substance_type: ${substanceType}. Must be one of: ${SUBSTANCE_TYPES.join(', ')}`);
  }
}

function buildEssence(substance) {
  return substance.essence || {
    role: substance.role || 'undefined',
    purpose: substance.purpose || 'unspecified',
    agentDna: substance.agentDna || null,
    teleology: substance.teleology || 'task_execution'
  };
}

function buildIdentityCriteria(substance) {
  return substance.identityCriteria || {
    memoryContinuityRequired: true,
    workspaceContinuityRequired: false,
    essentialProperties: ['role', 'purpose', 'agentDna'],
    maximalPartReplacementRatio: 0.5
  };
}

async function defineBeing(agentId, substance = {}) {
  if (!agentId || typeof agentId !== 'string') {
    throw new Error('ontologyCore.defineBeing requires a valid agentId');
  }

  const substanceType = substance.type || 'agent';
  validateSubstanceType(substanceType);

  const essence = buildEssence(substance);
  const identityCriteria = buildIdentityCriteria(substance);

  const db = await getDb();
  await db.run(
    `INSERT OR REPLACE INTO ontology_beings (id, substance_type, essence_json, identity_criteria_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    agentId, substanceType, JSON.stringify(essence), JSON.stringify(identityCriteria)
  );

  return getBeing(agentId);
}

async function getBeing(agentId) {
  const db = await getDb();
  const being = await db.get('SELECT * FROM ontology_beings WHERE id = ?', agentId);
  if (!being) return null;

  return {
    id: being.id,
    substanceType: being.substance_type,
    essence: JSON.parse(being.essence_json),
    identityCriteria: JSON.parse(being.identity_criteria_json),
    createdAt: being.created_at,
    updatedAt: being.updated_at,
    ceasedAt: being.ceased_at
  };
}

async function ensureBeingExists(agentId) {
  const db = await getDb();
  const exists = await db.get('SELECT 1 FROM ontology_beings WHERE id = ?', agentId);
  if (!exists) {
    await defineBeing(agentId, { type: 'agent' });
  }
}

async function listBeings(filters = {}) {
  const db = await getDb();
  const sql = buildListBeingsSql(filters);
  const params = buildListBeingsParams(filters);
  const rows = await db.all(sql, ...params);
  return rows.map(mapBeingRow);
}

function buildListBeingsSql(filters) {
  let sql = 'SELECT * FROM ontology_beings WHERE 1=1';
  if (filters.substanceType) sql += ' AND substance_type = ?';
  if (filters.activeOnly) sql += ' AND ceased_at IS NULL';
  sql += ' ORDER BY created_at DESC';
  if (filters.limit) sql += ' LIMIT ?';
  return sql;
}

function buildListBeingsParams(filters) {
  const params = [];
  if (filters.substanceType) params.push(filters.substanceType);
  if (filters.limit) params.push(filters.limit);
  return params;
}

function mapBeingRow(r) {
  return {
    id: r.id,
    substanceType: r.substance_type,
    essence: JSON.parse(r.essence_json),
    createdAt: r.created_at,
    ceasedAt: r.ceased_at
  };
}

async function ceaseBeing(agentId, reason = 'terminated') {
  const db = await getDb();
  await db.run(
    `UPDATE ontology_beings SET ceased_at = CURRENT_TIMESTAMP WHERE id = ?`,
    agentId
  );
  return { agentId, ceasedAt: new Date().toISOString(), reason };
}

module.exports = {
  defineBeing,
  getBeing,
  ensureBeingExists,
  listBeings,
  ceaseBeing,
  hashEssence,
  SUBSTANCE_TYPES
};