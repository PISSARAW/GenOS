'use strict';

const { deriveProfile } = require('./relationshipCommunicationProfileService');
const { excludeKnownDependentAudience } = require('../relationalPhysiology/legacyAudienceGate');

const DISCLOSURE_REQUIRED = Object.freeze({ low: 0, medium: 0.2, high: 0.5, critical: 0.8 });
const GROUNDING_LEVEL = Object.freeze({ none: 0, semantic_ack: 1, action_ack: 2, verified_ack: 3, human_confirmation: 4 });

async function profileAudience(input) {
  const candidates = await Promise.all((input.candidates || []).map((candidate) => profileCandidate(input, candidate)));
  const eligibleCandidates = rankByDomainTrust(
    candidates.filter((candidate) => eligible(candidate.communicationProfile, input.intent)), input.intent.domain);
  return excludeKnownDependentAudience(input, eligibleCandidates);
}

async function profileCandidate(input, candidate) {
  const communicationProfile = await deriveProfile({
    db: input.db, fromAgentId: input.intent.senderAgentId, toAgentId: candidate.agentId,
    organizationId: input.organizationId, projectId: input.projectId, domain: input.intent.domain
  });
  return { ...candidate, communicationProfile };
}

function rankByDomainTrust(candidates, domain) {
  if (typeof domain !== 'string' || !domain.trim()) return candidates;
  return candidates.map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => (right.candidate.communicationProfile.trustForDomain ?? -1)
      - (left.candidate.communicationProfile.trustForDomain ?? -1) || left.index - right.index)
    .map(({ candidate }) => candidate);
}

function eligible(profile, intent) {
  if (intent.independenceRequired && profile.epistemicIndependence < Number(intent.independenceThreshold ?? 0.7)) return false;
  return profile.disclosureLevel >= DISCLOSURE_REQUIRED[intent.risk];
}

function dialectAllowed(candidates) {
  return candidates.length > 0 && candidates.every((candidate) => (
    candidate.communicationProfile.dialectProbability === 'high'
      && candidate.communicationProfile.preferredEncoding === 'dialect'
  ));
}

function groundingForAudience(intent, candidates) {
  let grounding = baselineGrounding(intent);
  for (const candidate of candidates) {
    const recommendation = candidate.communicationProfile.recommendedGrounding;
    if ((GROUNDING_LEVEL[recommendation] || 0) > (GROUNDING_LEVEL[grounding] || 0)) grounding = recommendation;
  }
  return grounding;
}

function baselineGrounding(intent) {
  if (intent.risk === 'critical') return 'human_confirmation';
  if (intent.risk === 'high') return 'verified_ack';
  if (intent.risk === 'medium' && intent.requiresAction) return 'action_ack';
  return intent.requiresAction ? 'semantic_ack' : 'none';
}

function summariesOf(candidates) {
  return candidates.map((candidate) => ({
    agentId: candidate.agentId,
    relationType: candidate.communicationProfile.relationType,
    relationTypes: candidate.communicationProfile.relationTypes || [],
    relations: (candidate.communicationProfile.relations || []).map((relation) => ({
      relationType: relation.relationType, relationClass: relation.relationClass, direction: relation.direction
    })),
    preferredEncoding: candidate.communicationProfile.preferredEncoding,
    grounding: candidate.communicationProfile.recommendedGrounding,
    epistemicIndependence: candidate.communicationProfile.epistemicIndependence,
    disclosureLevel: candidate.communicationProfile.disclosureLevel
  }));
}

module.exports = { profileAudience, dialectAllowed, groundingForAudience, summariesOf };
