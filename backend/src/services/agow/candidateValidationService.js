'use strict';

const UNIT_MEASURES = [
  'predictionError', 'uncertainty', 'goalRelevance', 'expectedInformationGain',
  'urgency', 'novelty', 'actionability', 'causalConfidence', 'evidenceDebt'
];
const CONSTRAINT_STATES = new Set(['clear', 'review', 'blocked']);

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
    && validUnitMeasures(candidate.measures) && validConstraints(candidate) && validLifetime(candidate);
}

module.exports = { validCandidate };
