'use strict';

const crypto = require('crypto');
const { getDatabase, withTransaction } = require('../db');

const RELATION_TYPES = new Set(['parent', 'twin', 'chimera', 'plasmid', 'graft', 'collaborator']);

function assertRelationInput(input) {
  const sourceAgentId = String(input?.sourceAgentId || '').trim();
  const targetAgentId = String(input?.targetAgentId || '').trim();
  const relationType = String(input?.relationType || '').trim();
  assertDistinctAgents(sourceAgentId, targetAgentId);
  assertRelationType(relationType);
  return { sourceAgentId, targetAgentId, relationType };
}

function assertDistinctAgents(sourceAgentId, targetAgentId) {
  if (!sourceAgentId || !targetAgentId || sourceAgentId === targetAgentId) {
    throw new Error('A relation requires two distinct agents.');
  }
}

function assertRelationType(relationType) {
  if (!RELATION_TYPES.has(relationType)) throw new Error(`Unsupported relation type '${relationType}'.`);
}

function stableRelationId(type, key) {
  const digest = crypto.createHash('sha256').update(`${type}:${key}`).digest('hex').slice(0, 32);
  return `rel_${digest}`;
}

async function createRelation(input = {}) {
  const { sourceAgentId, targetAgentId, relationType } = assertRelationInput(input);
  const db = input.db || await getDatabase();
  const id = input.id || `rel_${crypto.randomUUID()}`;
  const metadataJson = JSON.stringify(input.metadata || {});
  await db.run(
    `INSERT INTO agent_relations
      (id, source_agent_id, target_agent_id, relation_type, metadata_json, organization_id, project_id, provenance_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET metadata_json = excluded.metadata_json,
       organization_id = excluded.organization_id, project_id = excluded.project_id,
       provenance_hash = excluded.provenance_hash, updated_at = CURRENT_TIMESTAMP
     WHERE agent_relations.source_agent_id = excluded.source_agent_id
       AND agent_relations.target_agent_id = excluded.target_agent_id
       AND agent_relations.relation_type = excluded.relation_type`,
    [id, sourceAgentId, targetAgentId, relationType, metadataJson, input.organizationId || null, input.projectId || null, input.provenanceHash || null]
  );
  const relation = await getRelation({ id, db });
  if (relation.sourceAgentId !== sourceAgentId || relation.targetAgentId !== targetAgentId || relation.relationType !== relationType) {
    throw new Error(`Relation id '${id}' is already assigned to a different edge.`);
  }
  return relation;
}

async function getRelation(input = {}) {
  const db = input.db || await getDatabase();
  const row = await db.get('SELECT * FROM agent_relations WHERE id = ?', input.id);
  return row ? deserializeRelation(row) : null;
}

async function listRelations(input = {}) {
  const db = input.db || await getDatabase();
  const values = [input.agentId, input.agentId];
  const rows = await db.all(
    `SELECT * FROM agent_relations
     WHERE (source_agent_id = ? OR target_agent_id = ?)
       AND organization_id IS ?
       AND project_id IS ?
     ORDER BY created_at ASC`,
    [values[0], values[1], input.organizationId || null, input.projectId || null]
  );
  return rows.map(deserializeRelation);
}

async function recordPlasmid(input = {}) {
  const db = input.db || await getDatabase();
  const plasmidId = String(input.plasmidId || '').trim();
  if (!plasmidId) throw new Error('plasmidId is required to persist a plasmid relation.');
  const id = input.id || stableRelationId('plasmid', `${plasmidId}:${input.sourceAgentId}:${input.targetAgentId}`);
  return withTransaction(db, async (tx) => {
    const relation = await createRelation({ ...input, db: tx, id, relationType: 'plasmid' });
    await tx.run(
      `INSERT INTO plasmid_bindings
        (plasmid_id, owner_agent_id, source_agent_id, organization_id, project_id, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(plasmid_id) DO UPDATE SET owner_agent_id = excluded.owner_agent_id,
         source_agent_id = excluded.source_agent_id, organization_id = excluded.organization_id,
         project_id = excluded.project_id, status = 'active', updated_at = CURRENT_TIMESTAMP`,
      [plasmidId, input.targetAgentId, input.sourceAgentId, input.organizationId || null, input.projectId || null]
    );
    return relation;
  });
}

function deserializeRelation(row) {
  return {
    id: row.id,
    sourceAgentId: row.source_agent_id,
    targetAgentId: row.target_agent_id,
    relationType: row.relation_type,
    metadata: JSON.parse(row.metadata_json || '{}'),
    organizationId: row.organization_id,
    projectId: row.project_id,
    provenanceHash: row.provenance_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { RELATION_TYPES, createRelation, getRelation, listRelations, recordPlasmid, stableRelationId };
