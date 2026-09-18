'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');

const RELATION_TYPES = Object.freeze([
  'subclass_of', 'part_of', 'contrasts_with', 'depends_on', 'refines',
  'exemplifies', 'presupposes', 'entails', 'disputes', 'interprets',
  'translates', 'has_variant', 'historically_precedes'
  , 'other', 'encounter', 'recognizes', 'refuses_control'
]);
const DIRECTIONS = new Set(['outgoing', 'incoming', 'both']);

function requiredText(value, name) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${name} must be a non-empty string.`);
  return text;
}

function relationValue(input, camel, snake) {
  return input[camel] === undefined ? input[snake] : input[camel];
}

function validateRelationType(relationType) {
  if (!RELATION_TYPES.includes(relationType)) {
    throw new Error(`Unknown ontology relation type '${relationType}'.`);
  }
  return relationType;
}

function validateConfidence(value) {
  const confidence = value === undefined ? 1 : Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('confidence must be a number between 0 and 1.');
  }
  return confidence;
}

function normalizeRelation(input = {}) {
  const relationType = validateRelationType(requiredText(relationValue(input, 'relationType', 'relation_type'), 'relationType'));
  const sourceKind = requiredText(relationValue(input, 'sourceKind', 'source_kind'), 'sourceKind');
  const sourceId = requiredText(relationValue(input, 'sourceId', 'source_id'), 'sourceId');
  const targetKind = requiredText(relationValue(input, 'targetKind', 'target_kind'), 'targetKind');
  const targetId = requiredText(relationValue(input, 'targetId', 'target_id'), 'targetId');
  const confidence = validateConfidence(input.confidence);
  return {
    sourceKind, sourceId, relationType, targetKind, targetId, confidence,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    provenance: input.provenance && typeof input.provenance === 'object' ? input.provenance : {},
    createdBy: relationValue(input, 'createdBy', 'created_by') || null,
    organizationId: relationValue(input, 'organizationId', 'organization_id') || null,
    projectId: relationValue(input, 'projectId', 'project_id') || null
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
      metadata_json, confidence, provenance_json, created_by, organization_id, project_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_kind, source_id, relation_type, target_kind, target_id)
    DO UPDATE SET metadata_json = excluded.metadata_json,
      confidence = excluded.confidence, provenance_json = excluded.provenance_json,
      created_by = excluded.created_by, organization_id = excluded.organization_id,
      project_id = excluded.project_id, updated_at = CURRENT_TIMESTAMP
  `, id, relation.sourceKind, relation.sourceId, relation.relationType,
  relation.targetKind, relation.targetId, JSON.stringify(relation.metadata),
  relation.confidence, JSON.stringify(relation.provenance), relation.createdBy,
  relation.organizationId, relation.projectId);
  const row = await db.get('SELECT * FROM ontology_relations WHERE id = ?', id);
  return decode(row);
}

async function getRelations(input = {}) {
  const entityKind = requiredText(relationValue(input, 'entityKind', 'entity_kind'), 'entityKind');
  const entityId = requiredText(relationValue(input, 'entityId', 'entity_id'), 'entityId');
  const direction = input.direction || 'both';
  validateDirection(direction);
  const relationType = relationValue(input, 'relationType', 'relation_type') || null;
  if (relationType) validateRelationType(relationType);
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  const queryParts = buildRelationQuery({ direction, entityKind, entityId, relationType, input });
  const db = await getDatabase();
  const rows = await db.all(queryParts.query, ...queryParts.params, limit);
  return rows.map(decode);
}

function buildRelationQuery({ direction, entityKind, entityId, relationType, input }) {
  const relation = relationPredicates({ direction, entityKind, entityId });
  const entityClause = relation.clauses.slice(0, direction === 'both' ? 2 : 1)
    .join(direction === 'both' ? ' OR ' : '');
  const filters = relationType ? ['relation_type = ?'] : [];
  const params = relationType ? [relationType] : [];
  const scopeFilter = relationScope(input);
  if (scopeFilter.sql) { filters.push(scopeFilter.sql); params.push(...scopeFilter.params); }
  const suffix = filters.length ? ` AND ${filters.join(' AND ')}` : '';
  return { query: `SELECT * FROM ontology_relations WHERE (${entityClause})${suffix} ORDER BY created_at DESC LIMIT ?`, params: [...relation.params, ...params] };
}

function relationScope(input) {
  const organizationId = relationValue(input, 'organizationId', 'organization_id');
  const projectId = relationValue(input, 'projectId', 'project_id');
  const clauses = [];
  const params = [];
  if (organizationId) { clauses.push('organization_id = ?'); params.push(organizationId); }
  if (projectId) { clauses.push('project_id = ?'); params.push(projectId); }
  return { sql: clauses.join(' AND '), params };
}

function validateDirection(direction) {
  if (!DIRECTIONS.has(direction)) throw new Error(`Unknown relation direction '${direction}'.`);
}

function relationPredicates({ direction, entityKind, entityId }) {
  const clauses = [];
  const params = [];
  const both = direction === 'both';
  if (direction === 'outgoing' || both) {
    clauses.push('(source_kind = ? AND source_id = ?)'); params.push(entityKind, entityId);
  }
  if (direction === 'incoming' || both) {
    clauses.push('(target_kind = ? AND target_id = ?)'); params.push(entityKind, entityId);
  }
  return { clauses, params };
}

module.exports = { RELATION_TYPES, normalizeRelation, addRelation, getRelations, decode };
