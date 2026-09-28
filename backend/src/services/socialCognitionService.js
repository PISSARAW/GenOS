'use strict';

const { boundedAnalysis } = require('./philosophyAnalysisContract');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireList(value, name) {
  if (!Array.isArray(value)) fail('SOCIAL_CONTEXT_INSUFFICIENT', `${name} must be an array.`);
  return value;
}

function requireContext(value) {
  if (typeof value !== 'string' || value.trim().length < 3) {
    fail('SOCIAL_CONTEXT_INSUFFICIENT', 'context must describe the analysis scope.');
  }
  return value.trim();
}

function assertDescriptiveOnly(input) {
  const elevated = ['runtimeAuthority', 'executionAuthority', 'authorizeExecution', 'apply', 'promote', 'promotionEligible', 'lease'];
  if (elevated.some((key) => input[key] !== undefined && input[key] !== false && input[key] !== null)) {
    fail('SOCIAL_AUTHORITY_REFUSED', 'Social cognition cannot grant runtime or execution authority.');
  }
}

function indexActors(actors) {
  const actorMap = new Map();
  for (const actor of actors) {
    if (!actor || typeof actor.id !== 'string' || !actor.id.trim()) {
      fail('SOCIAL_ACTOR_UNKNOWN', 'Each actor must have a declared non-empty id.');
    }
    const id = actor.id.trim();
    if (actorMap.has(id)) fail('SOCIAL_ACTOR_UNKNOWN', `Duplicate actor '${id}'.`);
    actorMap.set(id, { ...actor, id });
  }
  return actorMap;
}

function indexSources(sources) {
  const sourceMap = new Map();
  for (const source of sources) {
    if (!source || typeof source.id !== 'string' || !source.id.trim()) {
      fail('SOCIAL_PROVENANCE_MISSING', 'Each source must have a declared non-empty id.');
    }
    if (typeof source.provenance !== 'string' || !source.provenance.trim()) {
      fail('SOCIAL_PROVENANCE_MISSING', `Source '${source.id}' has no provenance.`);
    }
    const id = source.id.trim();
    if (sourceMap.has(id)) fail('SOCIAL_PROVENANCE_MISSING', `Duplicate source '${id}'.`);
    sourceMap.set(id, {
      id, provenance: source.provenance.trim(),
      method: typeof source.method === 'string' && source.method.trim() ? source.method.trim() : null
    });
  }
  return sourceMap;
}

function normalizeClaim(input) {
  const { claim, index, actors, sources } = input;
  const actorId = typeof claim?.actorId === 'string' ? claim.actorId.trim() : '';
  const sourceId = typeof claim?.sourceId === 'string' ? claim.sourceId.trim() : '';
  assertClaimActor({ claim, actorId, actors, index });
  assertClaimStatement({ claim, index });
  assertClaimSource({ sourceId, sources, index });
  assertConfidence({ confidence: claim.confidence, index });
  return {
    id: normalizeClaimId(claim, index),
    actorId,
    statement: claim.statement.trim(),
    topic: typeof claim.topic === 'string' ? claim.topic.trim() : null,
    source: sources.get(sourceId),
    confidence: claim.confidence ?? null,
    uncertainty: claim.uncertainty ?? null,
  };
}

function normalizeClaimId(claim, index) {
  if (claim.id === undefined || claim.id === null || claim.id === '') return `claim-${index + 1}`;
  if (typeof claim.id !== 'string' || !claim.id.trim()) {
    fail('SOCIAL_CONTEXT_INSUFFICIENT', `Claim ${index} id must be a non-empty string.`);
  }
  return claim.id.trim();
}

function assertClaimActor({ claim, actorId, actors, index }) {
  if (!claim || !actors.has(actorId)) fail('SOCIAL_ACTOR_UNKNOWN', `Claim ${index} references an undeclared actor.`);
}

function assertClaimStatement({ claim, index }) {
  if (typeof claim.statement !== 'string' || !claim.statement.trim()) {
    fail('SOCIAL_CONTEXT_INSUFFICIENT', `Claim ${index} has no statement.`);
  }
}

function assertClaimSource({ sourceId, sources, index }) {
  if (!sources.has(sourceId)) fail('SOCIAL_PROVENANCE_MISSING', `Claim ${index} has no declared source.`);
}

function assertConfidence({ confidence, index }) {
  if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    fail('SOCIAL_CONTEXT_INSUFFICIENT', `Claim ${index} confidence must be in [0, 1].`);
  }
}

function prepareClaims(claims, actors, sources) {
  return claims.map((claim, index) => normalizeClaim({ claim, index, actors, sources }));
}

function mapPositions(actors, claims) {
  return [...actors.values()].map((actor) => ({
    actorId: actor.id,
    label: actor.label || actor.name || actor.id,
    claims: claims.filter((claim) => claim.actorId === actor.id),
  }));
}

function normalizeRelations(input) {
  const endpoints = new Set([
    ...input.actors.keys(), ...input.claims.map((claim) => claim.id)
  ]);
  return input.relations.map((relation, index) => {
    const from = typeof relation?.from === 'string' ? relation.from.trim() : '';
    const to = typeof relation?.to === 'string' ? relation.to.trim() : '';
    const type = typeof relation?.type === 'string' ? relation.type.trim().toLocaleLowerCase() : '';
    if (!from || !to || !type) fail('SOCIAL_CONTEXT_INSUFFICIENT', `Relation ${index} requires from, to and type.`);
    if (!endpoints.has(from) || !endpoints.has(to)) {
      fail('SOCIAL_ACTOR_UNKNOWN', `Relation ${index} references an undeclared actor or claim.`);
    }
    return { from, to, type };
  });
}

function findDisagreements(relations) {
  const explicitTypes = new Set(['disagrees-with', 'contradicts', 'opposes']);
  return relations.filter((relation) => explicitTypes.has(relation.type));
}

function compareSources(claims) {
  return [...new Map(claims.map((claim) => [claim.source.id, claim.source])).values()]
    .map((source) => ({ id: source.id, provenance: source.provenance, method: source.method || null }));
}

function compareSourceCoverage(claims) {
  const topics = new Map();
  for (const claim of claims) {
    if (!claim.topic) continue;
    if (!topics.has(claim.topic)) topics.set(claim.topic, new Map());
    const topicSources = topics.get(claim.topic);
    if (!topicSources.has(claim.source.id)) topicSources.set(claim.source.id, []);
    topicSources.get(claim.source.id).push(claim.id);
  }
  return [...topics.entries()].flatMap(([topic, topicSources]) => {
    if (topicSources.size < 2) return [];
    return [{
      topic,
      sources: [...topicSources.entries()].map(([sourceId, claimIds]) => ({ sourceId, claimIds })),
    }];
  });
}

function normalizeUncertainties(uncertainties) {
  if (uncertainties.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail('SOCIAL_CONTEXT_INSUFFICIENT', 'uncertainties must contain non-empty declared descriptions.');
  }
  return uncertainties.map((entry) => entry.trim());
}

function analyzeSocialContext(input = {}) {
  assertDescriptiveOnly(input);
  const context = requireContext(input.context);
  const actors = indexActors(requireList(input.actors, 'actors'));
  const sources = indexSources(requireList(input.sources, 'sources'));
  const claims = prepareClaims(requireList(input.claims, 'claims'), actors, sources);
  assertUniqueClaimIds(claims);
  const relations = normalizeRelations({
    relations: requireList(input.relations || [], 'relations'), actors, claims
  });
  const uncertainties = normalizeUncertainties(requireList(input.uncertainties || [], 'uncertainties'));
  const unknowns = uncertainties;
  const disagreements = findDisagreements(relations);
  const result = boundedAnalysis({
    kind: 'social-cognition-map',
    status: claims.length ? 'descriptive-analysis' : 'no-claims',
    context,
    positions: mapPositions(actors, claims),
    disagreements,
    sources: compareSources(claims),
    sourceComparisons: compareSourceCoverage(claims),
    relations,
    uncertainties: unknowns,
    unknowns,
    limitations: [
      'Analyse limitée aux informations explicitement fournies.',
      'Aucune vérité, intention, permission ou état mental n’est inféré.',
    ],
    executable: false,
  });
  return { ...result, promotionEligible: false, authority: 'descriptive-only' };
}

function assertUniqueClaimIds(claims) {
  const ids = new Set(claims.map((claim) => claim.id));
  if (ids.size !== claims.length || claims.some((claim) => !claim.id)) {
    fail('SOCIAL_CONTEXT_INSUFFICIENT', 'Claim ids must be non-empty and unique.');
  }
}

module.exports = { analyzeSocialContext };
