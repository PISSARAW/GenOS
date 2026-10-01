'use strict';

const UNIT_MEASURES = [
  'predictionError', 'uncertainty', 'goalRelevance', 'expectedInformationGain',
  'urgency', 'novelty', 'actionability', 'causalConfidence', 'evidenceDebt'
];
const CONSTRAINT_STATES = new Set(['clear', 'review', 'blocked']);
const ORIGINS = new Set(['external_observed', 'tool_observed', 'other_agent_observed', 'self_action_expected', 'self_action_observed', 'self_generated', 'memory_retrieved', 'model_inferred', 'counterfactual_simulated', 'procedural_generated', 'unknown']);
const AGENCIES = new Set(['self', 'other', 'environment', 'unknown']);

function validString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validUnitMeasures(measures) {
  return UNIT_MEASURES.every((key) => Number.isFinite(measures?.[key]) && measures[key] >= 0 && measures[key] <= 1)
    && Number.isFinite(measures?.estimatedCost) && measures.estimatedCost >= 0;
}

function validIdentity(candidate) {
  return Boolean(candidate && validString(candidate.candidateId) && validString(candidate.agentId));
}

function validProvenance(candidate) {
  return validString(candidate.source?.module) && validString(candidate.source?.modality)
    && validString(candidate.content?.semanticType) && validString(candidate.stateHash);
}

function validEvidence(candidate) {
  return Array.isArray(candidate.evidenceRefs) && Array.isArray(candidate.causalParents);
}

function validCounterfactualOrigin(origin) {
  return origin.origin === 'counterfactual_simulated'
    && validString(origin.simulationId) && validString(origin.parentRealityFrameId);
}

function validRealOrigin(origin) {
  return origin.origin !== 'counterfactual_simulated' && origin.simulationId == null;
}

function validEpistemicOrigin(candidate) {
  const origin = candidate.epistemicOrigin;
  if (!origin || !ORIGINS.has(origin.origin) || !AGENCIES.has(origin.agency)) return false;
  if (origin.realityMode === 'counterfactual') return validCounterfactualOrigin(origin);
  if (origin.realityMode === 'real') return validRealOrigin(origin);
  return false;
}

function validConstraints(candidate) {
  const constraints = candidate.constraints || {};
  return ['safety', 'integrity', 'viability', 'userPolicy'].every((key) => CONSTRAINT_STATES.has(constraints[key]));
}

function validLifetime(candidate) {
  return Number.isFinite(candidate.producedAt) && Number.isFinite(candidate.expiresAt)
    && candidate.expiresAt > candidate.producedAt;
}

function validCandidate(candidate) {
  return validIdentity(candidate) && validProvenance(candidate) && validEvidence(candidate)
    && validEpistemicOrigin(candidate) && validUnitMeasures(candidate.measures)
    && validConstraints(candidate) && validLifetime(candidate);
}

module.exports = { validCandidate };
