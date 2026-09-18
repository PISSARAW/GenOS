'use strict';

const relations = require('../ontologyRelations');
const { text, object, evidence } = require('./ontologyContracts');

const RELATION_TYPES = Object.freeze(['other', 'encounter', 'recognizes', 'refuses_control']);

function normalize(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const otherId = text(input.otherId || input.personId, 'otherId');
  if (subjectId === otherId) throw new Error('subjectId and otherId must differ.');
  return { subjectId, otherId };
}

async function defineOther(input = {}) {
  const pair = normalize(input);
  const metadata = object(input.metadata || {}, 'metadata');
  const record = await relations.addRelation({
    sourceKind: 'being', sourceId: pair.subjectId, relationType: 'other',
    targetKind: 'being', targetId: pair.otherId, metadata: {
      symmetry: 'asymmetric', recognition: input.recognition || 'observed',
      boundaries: metadata.boundaries || { authority: 'none', control: 'forbidden' }, ...metadata,
    }, confidence: input.confidence, provenance: evidence(input.evidence), createdBy: input.createdBy,
    organizationId: input.organizationId, projectId: input.projectId,
  });
  return { defined: true, relation: record };
}

async function recordEncounter(input = {}) {
  const pair = normalize(input);
  return relations.addRelation({
    sourceKind: 'being', sourceId: pair.subjectId, relationType: 'encounter',
    targetKind: 'being', targetId: pair.otherId,
    metadata: object(input.context || {}, 'context'), provenance: evidence(input.evidence),
    confidence: input.confidence, createdBy: input.createdBy,
    organizationId: input.organizationId, projectId: input.projectId,
  });
}

async function listOtherRelations(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const result = await relations.getRelations({
    entityKind: 'being', entityId: subjectId, direction: 'outgoing', limit: input.limit,
    organizationId: input.organizationId, projectId: input.projectId,
  });
  return result.filter(item => RELATION_TYPES.includes(item.relationType));
}

async function evaluateAlterityBoundary(input = {}) {
  const pair = normalize(input);
  const action = text(input.action, 'action');
  const relationList = await listOtherRelations({ subjectId: pair.subjectId, limit: 500 });
  const relation = relationList.find(item => item.target.id === pair.otherId && item.relationType === 'other');
  const authorized = Boolean(relation && relation.metadata.boundaries && relation.metadata.boundaries[action] === 'allowed');
  return {
    subjectId: pair.subjectId, otherId: pair.otherId, action, allowed: authorized,
    reason: authorized ? 'explicit_boundary' : 'authority_not_established',
    requiresHumanReview: !authorized, evidenceStatus: 'unverified',
  };
}

module.exports = { RELATION_TYPES, defineOther, recordEncounter, listOtherRelations, evaluateAlterityBoundary };
