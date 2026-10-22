'use strict';

const relational = require('../crossAgentRelationalService');
const { listRelations, deriveProperties } = relational;

const EXTENDED_RELATION_TYPES = Object.freeze([
  'stranger', 'neighbor', 'bonded_partner', 'rival', 'temporary_ally',
  'client', 'supplier', 'guardian', 'dependent', 'sibling', 'coworker'
]);

const EXTENDED_RELATION_PRESETS = Object.freeze(Object.fromEntries(
  EXTENDED_RELATION_TYPES.map((type) => [type, deriveProperties(type)])
));
const LINEAGE_TYPES = new Set(['parent', 'child', 'sibling', 'twin', 'ancestor', 'descendant', 'chimera', 'plasmid', 'graft']);

function isLineageRelation(relationType) {
  return LINEAGE_TYPES.has(relationType);
}

function getExtendedProperties(relationType) {
  return deriveProperties(relationType);
}

function buildReasons(candidate) {
  const reasons = [];
  if ((candidate.domainCompetence ?? 0) > 0.7) reasons.push(`domain competence: ${candidate.domainCompetence.toFixed(2)}`);
  if ((candidate.epistemicIndependence ?? 0) > 0.7) reasons.push(`epistemic independence: ${candidate.epistemicIndependence.toFixed(2)}`);
  if ((candidate.errorCorrelation ?? 0) < 0.3) reasons.push(`low error correlation: ${(candidate.errorCorrelation ?? 0).toFixed(2)}`);
  return reasons;
}

function scoreRelation(candidate, requirements = {}) {
  const domainWeight = requirements.domainWeight ?? 0.35;
  const independenceWeight = requirements.independenceWeight ?? 0.35;
  const errorWeight = requirements.errorWeight ?? 0.30;
  const score = (candidate.domainCompetence ?? 0) * domainWeight
    + (candidate.epistemicIndependence ?? 0) * independenceWeight
    + (1 - (candidate.errorCorrelation ?? 0)) * errorWeight;
  return { score: Math.round(score * 1000) / 1000, reasons: buildReasons(candidate) };
}

function selectVerifier(ctx) {
  const { candidates = [], excludeIds = [] } = ctx;
  const excluded = new Set(excludeIds);
  const eligible = candidates.filter((candidate) => !excluded.has(candidate.agentId)
    && !isLineageRelation(candidate.relationType));
  let best = null;
  for (const candidate of eligible) {
    const result = scoreRelation(candidate);
    if (!best || result.score > best.score) best = { candidate, ...result };
  }
  return best;
}

function selectPartner(ctx) {
  const { candidates = [], relationType } = ctx;
  let best = null;
  for (const candidate of candidates.filter((item) => item.relationType === relationType)) {
    const result = scoreRelation(candidate, { domainWeight: 0.3, independenceWeight: 0.2, errorWeight: 0.2 });
    const score = Math.round((result.score + 0.3) * 1000) / 1000;
    if (!best || score > best.score) best = { candidate, score, reasons: [...result.reasons, `relation match: ${relationType}`] };
  }
  return best;
}

function strangerProfile() {
  return { relationType: 'stranger', relationClass: 'social', properties: deriveProperties('stranger'), direction: 'none' };
}

function relationOrder(left, right) {
  return (right.metadata.familiarity || 0) - (left.metadata.familiarity || 0);
}

function profileOfRelation(relation, agentA) {
  return {
    relationId: relation.id,
    relationType: relation.relationType,
    relationClass: relation.relationClass,
    properties: { ...deriveProperties(relation.relationType), ...relation.metadata },
    direction: relation.sourceAgentId === agentA ? 'forward' : 'reverse'
  };
}

async function getRelationProfiles(agentA, agentB, context = {}) {
  const relations = await listRelations({ ...context, agentId: agentA });
  const matches = relations.filter((relation) =>
    (relation.sourceAgentId === agentA && relation.targetAgentId === agentB)
    || (relation.sourceAgentId === agentB && relation.targetAgentId === agentA));
  matches.sort(relationOrder);
  return matches.map((relation) => profileOfRelation(relation, agentA));
}

async function getRelationProfile(agentA, agentB, context = {}) {
  const relations = await getRelationProfiles(agentA, agentB, context);
  if (!relations.length) return strangerProfile();
  return { ...relations[0], relationTypes: [...new Set(relations.map((relation) => relation.relationType))], relations };
}

module.exports = {
  EXTENDED_RELATION_TYPES,
  EXTENDED_RELATION_PRESETS,
  selectVerifier,
  selectPartner,
  scoreRelation,
  getRelationProfile,
  getRelationProfiles,
  isLineageRelation,
  getExtendedProperties
};
