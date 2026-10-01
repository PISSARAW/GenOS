'use strict';

const UNIT_MEASURES = [
  'predictionError', 'uncertainty', 'goalRelevance', 'expectedInformationGain',
  'urgency', 'novelty', 'actionability', 'causalConfidence', 'evidenceDebt'
];
const CONSTRAINT_STATES = new Set(['clear', 'review', 'blocked']);
const ORIGINS = new Set(['external_observed', 'tool_observed', 'other_agent_observed', 'self_action_expected', 'self_action_observed', 'self_generated', 'memory_retrieved', 'model_inferred', 'counterfactual_simulated', 'procedural_generated', 'unknown']);
const AGENCIES = new Set(['self', 'other', 'environment', 'unknown']);
const ALLOSTATIC_FIELDS = new Set(['energy', 'memoryPressure', 'socialState', 'modelDrift', 'contextPressure', 'integrity', 'stress']);
const CONTEXT_FIELDS = new Set(['beliefImportance', 'causalDescendantCount', 'irreversibility', 'expectedAllostaticState']);

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
  if (!validOriginReferences(origin)) return false;
  if (origin.realityMode === 'counterfactual') return validCounterfactualOrigin(origin);
  if (origin.realityMode === 'real') return validRealOrigin(origin);
  return false;
}

function validOriginReferences(origin) {
  const simulation = origin.simulationId == null || typeof origin.simulationId === 'string';
  const parent = origin.parentRealityFrameId == null || typeof origin.parentRealityFrameId === 'string';
  return simulation && parent;
}

function validEpistemicContext(candidate) {
  const context = candidate.epistemicContext;
  if (context == null) return true;
  if (typeof context !== 'object' || Array.isArray(context)) return false;
  return validContextKeys(context) && validContextUnits(context)
    && validDescendantCount(context) && validPredictedState(context.expectedAllostaticState);
}

function validContextKeys(context) {
  return Object.keys(context).every((key) => CONTEXT_FIELDS.has(key));
}

function validContextUnits(context) {
  return ['beliefImportance', 'irreversibility'].every((key) => context[key] == null
    || (Number.isFinite(context[key]) && context[key] >= 0 && context[key] <= 1));
}

function validDescendantCount(context) {
  const count = context.causalDescendantCount;
  return count == null || (Number.isInteger(count) && count >= 0);
}

function validPredictedState(state) {
  if (state == null) return true;
  if (typeof state !== 'object' || Array.isArray(state)) return false;
  return Object.entries(state).every(([key, value]) => ALLOSTATIC_FIELDS.has(key)
    && Number.isFinite(value) && value >= 0 && value <= 1);
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
    && validEpistemicOrigin(candidate) && validEpistemicContext(candidate) && validUnitMeasures(candidate.measures)
    && validConstraints(candidate) && validLifetime(candidate);
}

module.exports = { validCandidate };
