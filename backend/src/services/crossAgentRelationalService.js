'use strict';

const crypto = require('crypto');
const { getDatabase, withTransaction } = require('../db');

const RELATION_CLASSES = Object.freeze({
  lineage: { types: new Set(['parent', 'child', 'sibling', 'twin', 'ancestor', 'descendant', 'chimera', 'plasmid', 'graft']) },
  organizational: { types: new Set(['manager', 'subordinate', 'colleague', 'coworker', 'mentor', 'collaborator', 'client', 'supplier']) },
  collaborative: { types: new Set(['collaborator', 'colleague', 'partner']) },
  social: { types: new Set(['stranger', 'friend', 'partner', 'bonded_partner', 'neighbor', 'rival', 'temporary_ally', 'guardian', 'dependent']) },
  epistemic: { types: new Set(['verifier', 'reviewer']) },
  adversarial: { types: new Set(['adversary']) }
});

const RELATION_TYPES = new Set([
  'parent', 'child', 'sibling', 'twin', 'ancestor', 'descendant', 'chimera', 'plasmid', 'graft',
  'manager', 'subordinate', 'colleague', 'coworker', 'collaborator', 'mentor',
  'stranger', 'friend', 'partner', 'bonded_partner', 'neighbor', 'rival', 'temporary_ally',
  'client', 'supplier', 'guardian', 'dependent', 'verifier', 'reviewer', 'adversary'
]);

const RELATION_PROPERTY_PRESETS = Object.freeze({
  parent: { familiarity: 0.8, sharedHistory: 0.7, authority: 0.9, trustForDomain: 0.7, epistemicIndependence: 0.2, errorCorrelation: 0.8, disclosureLevel: 0.6 },
  child: { familiarity: 0.8, sharedHistory: 0.7, authority: 0.3, trustForDomain: 0.7, epistemicIndependence: 0.2, errorCorrelation: 0.8, disclosureLevel: 0.6 },
  sibling: { familiarity: 0.8, interactionCount: 8, sharedHistory: 0.8, authority: 0.5, trustForDomain: 0.6, commonGroundEstimate: 0.7, epistemicIndependence: 0.4, errorCorrelation: 0.6, disclosureLevel: 0.6 },
  twin: { familiarity: 0.9, sharedHistory: 0.9, authority: 0.5, trustForDomain: 0.8, epistemicIndependence: 0.1, errorCorrelation: 0.9, disclosureLevel: 0.8 },
  ancestor: { familiarity: 0.6, sharedHistory: 0.6, authority: 0.7, trustForDomain: 0.6, epistemicIndependence: 0.3, errorCorrelation: 0.6, disclosureLevel: 0.5 },
  descendant: { familiarity: 0.6, sharedHistory: 0.5, authority: 0.3, trustForDomain: 0.5, epistemicIndependence: 0.3, errorCorrelation: 0.6, disclosureLevel: 0.5 },
  chimera: { familiarity: 0.7, sharedHistory: 0.6, authority: 0.5, trustForDomain: 0.6, epistemicIndependence: 0.4, errorCorrelation: 0.5, disclosureLevel: 0.5 },
  plasmid: { familiarity: 0.5, sharedHistory: 0.4, authority: 0.4, trustForDomain: 0.5, epistemicIndependence: 0.5, errorCorrelation: 0.4, disclosureLevel: 0.5 },
  graft: { familiarity: 0.5, sharedHistory: 0.4, authority: 0.4, trustForDomain: 0.5, epistemicIndependence: 0.5, errorCorrelation: 0.4, disclosureLevel: 0.5 },
  manager: { familiarity: 0.5, authority: 0.8, trustForDomain: 0.5, disclosureLevel: 0.3 },
  subordinate: { familiarity: 0.5, authority: 0.3, trustForDomain: 0.5, disclosureLevel: 0.6 },
  colleague: { familiarity: 0.5, interactionCount: 5, sharedHistory: 0.4, authority: 0.4, trustForDomain: 0.6, commonGroundEstimate: 0.5, disclosureLevel: 0.5 },
  coworker: { familiarity: 0.5, interactionCount: 5, sharedHistory: 0.4, authority: 0.4, trustForDomain: 0.6, commonGroundEstimate: 0.5, disclosureLevel: 0.5 },
  collaborator: { familiarity: 0.6, interactionCount: 5, sharedHistory: 0.5, authority: 0.5, trustForDomain: 0.7, commonGroundEstimate: 0.6, disclosureLevel: 0.5 },
  mentor: { familiarity: 0.6, sharedHistory: 0.5, authority: 0.7, trustForDomain: 0.7, disclosureLevel: 0.5 },
  friend: { familiarity: 0.7, interactionCount: 12, sharedHistory: 0.6, authority: 0.3, trustForDomain: 0.6, commonGroundEstimate: 0.5, disclosureLevel: 0.4 },
  partner: { familiarity: 0.6, interactionCount: 8, sharedHistory: 0.5, authority: 0.5, trustForDomain: 0.6, commonGroundEstimate: 0.5, disclosureLevel: 0.5 },
  stranger: { familiarity: 0, sharedHistory: 0, authority: 0, trustForDomain: 0, commonGroundEstimate: 0, epistemicIndependence: 1, errorCorrelation: 0, disclosureLevel: 0.3 },
  neighbor: { familiarity: 0.3, sharedHistory: 0.2, authority: 0.3, trustForDomain: 0.4, commonGroundEstimate: 0.3, epistemicIndependence: 0.7, errorCorrelation: 0.3, disclosureLevel: 0.5 },
  bonded_partner: { familiarity: 0.8, sharedHistory: 0.7, authority: 0.5, trustForDomain: 0.8, commonGroundEstimate: 0.7, epistemicIndependence: 0.4, errorCorrelation: 0.5, disclosureLevel: 0.7 },
  rival: { familiarity: 0.4, sharedHistory: 0.3, authority: 0.3, trustForDomain: 0.2, commonGroundEstimate: 0.2, epistemicIndependence: 0.9, errorCorrelation: 0.1, disclosureLevel: 0.2 },
  temporary_ally: { familiarity: 0.3, sharedHistory: 0.2, authority: 0.3, trustForDomain: 0.4, commonGroundEstimate: 0.3, epistemicIndependence: 0.6, errorCorrelation: 0.3, disclosureLevel: 0.4 },
  client: { familiarity: 0.4, sharedHistory: 0.3, authority: 0.2, trustForDomain: 0.5, commonGroundEstimate: 0.4, epistemicIndependence: 0.5, errorCorrelation: 0.4, disclosureLevel: 0.5 },
  supplier: { familiarity: 0.4, sharedHistory: 0.3, authority: 0.4, trustForDomain: 0.5, commonGroundEstimate: 0.4, epistemicIndependence: 0.5, errorCorrelation: 0.4, disclosureLevel: 0.5 },
  guardian: { familiarity: 0.6, sharedHistory: 0.5, authority: 0.7, trustForDomain: 0.6, commonGroundEstimate: 0.5, epistemicIndependence: 0.3, errorCorrelation: 0.5, disclosureLevel: 0.6 },
  dependent: { familiarity: 0.5, sharedHistory: 0.4, authority: 0.2, trustForDomain: 0.4, commonGroundEstimate: 0.4, epistemicIndependence: 0.3, errorCorrelation: 0.5, disclosureLevel: 0.5 },
  verifier: { familiarity: 0.3, authority: 0.4, trustForDomain: 0.6, epistemicIndependence: 0.9, errorCorrelation: 0.2, disclosureLevel: 0.7 },
  reviewer: { familiarity: 0.3, authority: 0.4, trustForDomain: 0.6, epistemicIndependence: 0.9, errorCorrelation: 0.2, disclosureLevel: 0.8 },
  adversary: { familiarity: 0.2, authority: 0.2, epistemicIndependence: 1.0, errorCorrelation: 0.1, disclosureLevel: 0.1 }
});

function baseProperties() {
  return {
    familiarity: 0,
    interactionCount: 0,
    sharedHistory: 0,
    authority: 0,
    trustForDomain: 0,
    commonGroundEstimate: 0,
    epistemicIndependence: 1,
    errorCorrelation: 0,
    disclosureLevel: 1,
    preferredDialect: null,
    lastInteraction: null
  };
}

function deriveProperties(relationType) {
  const preset = RELATION_PROPERTY_PRESETS[relationType];
  if (!preset) return baseProperties();
  return Object.assign(baseProperties(), preset);
}

function assertRelationInput(input) {
  const sourceAgentId = String(input.sourceAgentId || '').trim();
  const targetAgentId = String(input.targetAgentId || '').trim();
  const relationType = String(input.relationType || '').trim();
  const relationClass = String(input.relationClass || '').trim();
  assertDistinctAgents(sourceAgentId, targetAgentId);
  assertRelationType(relationType);
  assertRelationClass(relationClass, relationType);
  return { sourceAgentId, targetAgentId, relationType, relationClass };
}

function assertDistinctAgents(sourceAgentId, targetAgentId) {
  if (!sourceAgentId || !targetAgentId || sourceAgentId === targetAgentId) {
    throw new Error('A relation requires two distinct agents.');
  }
}

function assertRelationType(relationType) {
  if (!RELATION_TYPES.has(relationType)) throw new Error(`Unsupported relation type '${relationType}'.`);
}

function assertRelationClass(relationClass, relationType) {
  if (!relationClass) return;
  const cls = RELATION_CLASSES[relationClass];
  if (!cls) throw new Error(`Unsupported relation class '${relationClass}'.`);
  if (!cls.types.has(relationType)) {
    throw new Error(`Relation type '${relationType}' does not belong to class '${relationClass}'.`);
  }
}

function inferRelationClass(relationType) {
  const names = Object.keys(RELATION_CLASSES);
  for (let index = 0; index < names.length; index += 1) {
    const cls = RELATION_CLASSES[names[index]];
    if (cls.types.has(relationType)) return names[index];
  }
  return null;
}

function stableRelationId(type, key) {
  const digest = crypto.createHash('sha256').update(`${type}:${key}`).digest('hex').slice(0, 32);
  return `rel_${digest}`;
}

function toNull(value) {
  if (value) return value;
  return null;
}

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

function resolveRelationId(inputId) {
  if (inputId) return inputId;
  return `rel_${crypto.randomUUID()}`;
}

function edgeKey(edge) {
  return [edge.sourceAgentId, edge.targetAgentId, edge.relationType, edge.relationClass].join('\u0001');
}

function checkEdgeOwner(relation, expected) {
  if (!relation) throw new Error(`Relation id '${expected.id}' was not persisted.`);
  if (edgeKey(relation) !== edgeKey(expected)) {
    throw new Error(`Relation id '${expected.id}' is already assigned to a different edge.`);
  }
}

function buildInsertValues(edge, metadata, scope) {
  return [
    edge.id, edge.sourceAgentId, edge.targetAgentId, edge.relationType, edge.relationClass,
    metadata.familiarity, metadata.interactionCount, metadata.sharedHistory, metadata.authority,
    metadata.trustForDomain, metadata.commonGroundEstimate, metadata.epistemicIndependence,
    metadata.errorCorrelation, metadata.disclosureLevel, metadata.preferredDialect, metadata.lastInteraction,
    JSON.stringify(metadata), scope.organizationId, scope.projectId, scope.provenanceHash
  ];
}

async function createRelation(input) {
  const checked = assertRelationInput(input || {});
  const db = await resolveDb(input.db);
  const metadata = Object.assign(deriveProperties(checked.relationType), input.metadata);
  const edge = buildEdge(checked, input, metadata);
  await db.run(
    `INSERT INTO agent_relations
      (id, source_agent_id, target_agent_id, relation_type, relation_class,
       familiarity, interaction_count, shared_history, authority, trust_for_domain,
       common_ground_estimate, epistemic_independence, error_correlation,
       disclosure_level, preferred_dialect, last_interaction,
       metadata_json, organization_id, project_id, provenance_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    buildInsertValues(edge, metadata, scopeOf(input))
  );
  const relation = await getRelation({ id: edge.id, db });
  checkEdgeOwner(relation, edge);
  return relation;
}

function buildEdge(checked, input, metadata) {
  return {
    id: resolveRelationId(input.id),
    sourceAgentId: checked.sourceAgentId,
    targetAgentId: checked.targetAgentId,
    relationType: checked.relationType,
    relationClass: classOf(checked, metadata)
  };
}

function classOf(checked, metadata) {
  if (checked.relationClass) return checked.relationClass;
  if (metadata.relationClass) return metadata.relationClass;
  return inferRelationClass(checked.relationType);
}

function scopeOf(input) {
  return {
    organizationId: toNull(input.organizationId),
    projectId: toNull(input.projectId),
    provenanceHash: toNull(input.provenanceHash)
  };
}

async function getRelation(input) {
  const db = await resolveDb(input.db);
  const row = await db.get('SELECT * FROM agent_relations WHERE id = ?', input.id);
  if (!row) return null;
  return deserializeRelation(row);
}

async function listRelations(input) {
  const safe = input || {};
  const db = await resolveDb(safe.db);
  const scope = scopeOf(safe);
  const rows = await db.all(
    `SELECT * FROM agent_relations
     WHERE (source_agent_id = ? OR target_agent_id = ?)
       AND organization_id IS ?
       AND project_id IS ?
     ORDER BY created_at ASC`,
    [safe.agentId, safe.agentId, scope.organizationId, scope.projectId]
  );
  return rows.map(deserializeRelation);
}

async function recordPlasmid(input) {
  const db = await resolveDb(input.db);
  const plasmidId = String(input.plasmidId || '').trim();
  if (!plasmidId) throw new Error('plasmidId is required to persist a plasmid relation.');
  const id = resolveRelationId(input.id || stableRelationId('plasmid', `${plasmidId}:${input.sourceAgentId}:${input.targetAgentId}`));
  return withTransaction(db, async (tx) => {
    const relation = await createRelation({ ...input, db: tx, id, relationType: 'plasmid', relationClass: 'lineage' });
    await tx.run(
      `INSERT INTO plasmid_bindings
        (plasmid_id, owner_agent_id, source_agent_id, organization_id, project_id, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(plasmid_id) DO UPDATE SET owner_agent_id = excluded.owner_agent_id,
         source_agent_id = excluded.source_agent_id, organization_id = excluded.organization_id,
         project_id = excluded.project_id, status = 'active', updated_at = CURRENT_TIMESTAMP`,
      [plasmidId, input.targetAgentId, input.sourceAgentId, toNull(input.organizationId), toNull(input.projectId)]
    );
    return relation;
  });
}

function deserializeRelation(row) {
  const metadata = JSON.parse(row.metadata_json || '{}');
  return {
    id: row.id,
    sourceAgentId: row.source_agent_id,
    targetAgentId: row.target_agent_id,
    relationType: row.relation_type,
    relationClass: row.relation_class || metadata.relationClass || null,
    metadata,
    organizationId: row.organization_id,
    projectId: row.project_id,
    provenanceHash: row.provenance_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = { RELATION_TYPES, RELATION_CLASSES, createRelation, getRelation, listRelations, recordPlasmid, stableRelationId, deriveProperties, inferRelationClass };
