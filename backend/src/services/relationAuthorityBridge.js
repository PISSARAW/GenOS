'use strict';

const resolver = require('./morphogenesis/relationResolverService');

const CONTROL_GRANTING_TYPES = Object.freeze(new Set(['manager', 'guardian', 'mentor', 'parent']));
const VERIFIER_BLOCKED_TYPES = Object.freeze(new Set([
  'parent', 'child', 'sibling', 'twin', 'ancestor', 'descendant', 'chimera', 'plasmid', 'graft'
]));

function relationGrantsControl(relationType, direction) {
  if (direction !== 'forward') return false;
  return CONTROL_GRANTING_TYPES.has(String(relationType || ''));
}

function isVerifierBlocked(relationType) {
  return VERIFIER_BLOCKED_TYPES.has(String(relationType || ''));
}

function filterVerifierCandidates(candidates, excludeIds) {
  const excluded = new Set(excludeIds || []);
  const eligible = (candidates || []).filter((candidate) =>
    candidate && !excluded.has(candidate.agentId) && !isVerifierBlocked(candidate.relationType));
  return resolver.selectVerifier({ candidates: eligible, excludeIds: [] });
}

async function resolveControlByRelation(actorId, targetId, context) {
  const options = context || {};
  const profile = await resolver.getRelationProfile(actorId, targetId, options);
  const granted = relationGrantsControl(profile.relationType, profile.direction);
  return { granted, profile };
}

module.exports = {
  CONTROL_GRANTING_TYPES,
  VERIFIER_BLOCKED_TYPES,
  relationGrantsControl,
  isVerifierBlocked,
  filterVerifierCandidates,
  resolveControlByRelation
};
