'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');

const RELATION_TYPES = Object.freeze([
  'subclass_of', 'part_of', 'contrasts_with', 'depends_on', 'refines',
  'exemplifies', 'presupposes', 'entails', 'disputes', 'interprets',
  'translates', 'has_variant', 'historically_precedes'
]);
const DIRECTIONS = new Set(['outgoing', 'incoming', 'both']);

function requiredText(value, name) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${name} must be a non-empty string.`);
  return text;
}

function normalizeRelation(input = {}) {
  const relationType = requiredText(input.relationType || input.relation_type, 'relationType');
  if (!RELATION_TYPES.includes(relationType)) {
    throw new Error(`Unknown ontology relation type '${relationType}'.`);
  }
  const sourceKind = requiredText(input.sourceKind || input.source_kind, 'sourceKind');
  const sourceId = requiredText(input.sourceId || input.source_id, 'sourceId');
  const targetKind = requiredText(input.targetKind || input.target_kind, 'targetKind');
  const targetId = requiredText(input.targetId || input.target_id, 'targetId');
  const confidence = input.confidence === undefined ? 1 : Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('confidence must be a number between 0 and 1.');
  }
  return {
    sourceKind, sourceId, relationType, targetKind, targetId, confidence,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    provenance: input.provenance && typeof input.provenance === 'object' ? input.provenance : {},
    createdBy: input.createdBy || input.created_by || null
  };
}

function relationId(relation) {
  return `orel_${crypto.createHash('sha256').update(JSON.stringify([
    relation.sourceKind, relation.sourceId, relation.relationType,
    relation.targetKind, relation.targetId
  ])).digest('hex').slice(0, 24)}`;
}

function decode(row) {
  return {
    id: row.id,
    source: { kind: row.source_kind, id: row.source_id },
    relationType: row.relation_type,
    target: { kind: row.target_kind, id: row.target_id },
    metadata: JSON.parse(row.metadata_json || '{}'),
    confidence: row.confidence,
    provenance: JSON.parse(row.provenance_json || '{}'),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function addRelation(input) {
  const relation = normalizeRelation(input);
  const db = await getDatabase();
  const id = relationId(relation);
  await db.run(`
    INSERT INTO ontology_relations
      (id, source_kind, source_id, relation_type, target_kind, target_id,
       metadata_json, confidence, provenance_json, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_kind, source_id, relation_type, target_kind, target_id)
    DO UPDATE SET metadata_json = excluded.metadata_json,
      confidence = excluded.confidence, provenance_json = excluded.provenance_json,
      created_by = excluded.created_by, updated_at = CURRENT_TIMESTAMP
  `, id, relation.sourceKind, relation.sourceId, relation.relationType,
  relation.targetKind, relation.targetId, JSON.stringify(relation.metadata),
  relation.confidence, JSON.stringify(relation.provenance), relation.createdBy);
  const row = await db.get('SELECT * FROM ontology_relations WHERE id = ?', id);
  return decode(row);
}

async function getRelations(input = {}) {
  const entityKind = requiredText(input.entityKind || input.entity_kind, 'entityKind');
  const entityId = requiredText(input.entityId || input.entity_id, 'entityId');
  const direction = input.direction || 'both';
  if (!DIRECTIONS.has(direction)) throw new Error(`Unknown relation direction '${direction}'.`);
  const relationType = input.relationType || input.relation_type || null;
  if (relationType && !RELATION_TYPES.includes(relationType)) throw new Error(`Unknown ontology relation type '${relationType}'.`);
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  const clauses = [];
  const params = [];
  if (direction === 'outgoing' || direction === 'both') {
    clauses.push('(source_kind = ? AND source_id = ?)'); params.push(entityKind, entityId);
  }
  if (direction === 'incoming' || direction === 'both') {
    clauses.push('(target_kind = ? AND target_id = ?)'); params.push(entityKind, entityId);
  }
  if (relationType) { clauses.push('relation_type = ?'); params.push(relationType); }
  const db = await getDatabase();
  const entityClause = clauses.slice(0, direction === 'both' ? 2 : 1).join(direction === 'both' ? ' OR ' : '');
  const typeClause = relationType ? ' AND relation_type = ?' : '';
  const query = `SELECT * FROM ontology_relations WHERE (${entityClause})${typeClause} ORDER BY created_at DESC LIMIT ?`;
  const rows = await db.all(query, ...params, limit);
  return rows.map(decode);
}

module.exports = { RELATION_TYPES, normalizeRelation, addRelation, getRelations, decode };
