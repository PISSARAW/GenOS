'use strict';

const { createHash } = require('node:crypto');
const workspace = require('../../globalWorkspaceService');

const ADAPTERS = Object.freeze({
  perception: 'observation', world_model: 'world_state', memory: 'memory_retrieval', self: 'self_state',
  metacognition: 'reliability_estimate', interoception: 'resource_state', epistemic: 'belief_state',
  worker: 'worker_result', daemon: 'daemon_event', efference: 'action_consequence',
  morphogenesis: 'morphogenesis_proposal'
});

const ORIGIN_BY_MODULE = Object.freeze({
  perception: ['external_observed', 'environment'],
  memory: ['memory_retrieved', 'unknown'],
  self: ['model_inferred', 'self'],
  efference: ['self_action_observed', 'self'],
  worker: ['unknown', 'unknown'],
  world_model: ['model_inferred', 'unknown'],
  metacognition: ['model_inferred', 'unknown'],
  morphogenesis: ['model_inferred', 'unknown']
});
const ALLOSTATIC_VARIABLES = new Set(['energy', 'memoryPressure', 'socialState', 'modelDrift', 'contextPressure', 'integrity', 'stress']);

function unit(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function constraint(value) {
  return ['clear', 'review', 'blocked'].includes(value) ? value : 'clear';
}

function buildMeasures(observation) {
  const confidence = unit(observation.confidence, 0.5);
  const uncertainty = 1 - confidence;
  const predictionError = unit(observation.predictionError);
  const evidenceCoverage = unit(observation.evidenceCoverage);
  const urgency = observation.severity === 'critical' ? 1 : observation.severity === 'high' ? 0.8 : 0.3;
  return {
    predictionError, uncertainty, goalRelevance: observation.goalMatched === true ? 0.8 : 0.2,
    expectedInformationGain: Math.min(1, uncertainty * (1 - unit(observation.redundancy))), urgency,
    novelty: unit(Number(observation.noveltyCount) / 10), actionability: observation.actionable === true ? 0.8 : 0.2,
    causalConfidence: unit(observation.causalEvidence ? confidence : confidence * 0.5),
    evidenceDebt: 1 - evidenceCoverage, estimatedCost: Math.max(0, Number(observation.estimatedCost) || 0)
  };
}

function buildContent(observation, module) {
  const semanticType = String(observation.semanticType || ADAPTERS[module] || 'organ_observation');
  return { semanticType, artifactRef: observation.artifactRef || null, compactPreview: String(observation.compactPreview || '').slice(0, 2000) };
}

function buildConstraints(observation) {
  const constraints = observation.constraints || {};
  return { safety: constraint(constraints.safety), integrity: constraint(constraints.integrity), viability: constraint(constraints.viability), userPolicy: constraint(constraints.userPolicy) };
}

function epistemicOrigin(module, observation) {
  const supplied = observation.epistemicOrigin;
  if (supplied && typeof supplied === 'object') return {
    origin: supplied.origin || 'unknown', realityMode: supplied.realityMode || 'real',
    agency: supplied.agency || 'unknown', simulationId: supplied.simulationId || null,
    parentRealityFrameId: supplied.parentRealityFrameId || null
  };
  const [origin, agency] = ORIGIN_BY_MODULE[module] || ['unknown', 'unknown'];
  return { origin, realityMode: 'real', agency, simulationId: null, parentRealityFrameId: null };
}

function epistemicContext(observation) {
  const source = observation.epistemicContext;
  if (!source || typeof source !== 'object') return undefined;
  const result = {};
  if (source.beliefImportance != null) result.beliefImportance = unit(source.beliefImportance);
  if (source.causalDescendantCount != null) result.causalDescendantCount = Math.max(0, Math.floor(Number(source.causalDescendantCount) || 0));
  if (source.irreversibility != null) result.irreversibility = unit(source.irreversibility);
  if (source.expectedAllostaticState && typeof source.expectedAllostaticState === 'object') {
    result.expectedAllostaticState = Object.fromEntries(Object.entries(source.expectedAllostaticState)
      .filter(([key, value]) => ALLOSTATIC_VARIABLES.has(key) && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, unit(value)]));
  }
  return result;
}

function build(options) {
  const { observation, agentId, module, now = Date.now() } = options;
  const evidenceRefs = Array.isArray(observation.evidenceRefs) ? observation.evidenceRefs.filter((value) => typeof value === 'string') : [];
  const context = epistemicContext(observation);
  return {
    candidateId: String(observation.candidateId || `${module}:${agentId}:${now}`), agentId,
    source: { module, instanceId: observation.instanceId || null, modality: ADAPTERS[module] || 'organ_observation' },
    content: buildContent(observation, module),
    epistemicOrigin: epistemicOrigin(module, observation),
    ...(context ? { epistemicContext: context } : {}),
    evidenceRefs, causalParents: Array.isArray(observation.causalParents) ? observation.causalParents.filter((value) => typeof value === 'string') : [],
    measures: buildMeasures(observation), constraints: buildConstraints(observation),
    redundancyKey: observation.redundancyKey || null, producedAt: now,
    expiresAt: now + Math.max(1000, Number(observation.ttlMs) || 60000),
    stateHash: String(observation.stateHash || createHash('sha256').update(JSON.stringify(observation)).digest('hex'))
  };
}

async function submit(options) {
  const module = options?.candidate?.source?.module || options?.module;
  if (!Object.hasOwn(ADAPTERS, module)) return { accepted: false, reason: 'unknown_candidate_source' };
  const candidate = options.candidate || build({ ...options, now: Number(options.now) || Date.now() });
  if (!require('../candidateValidationService').validCandidate(candidate)) {
    return { accepted: false, reason: 'candidate_invalid' };
  }
  return workspace.submitCandidate({ ...options, candidate, now: candidate.producedAt });
}

module.exports = { submit, build, epistemicOrigin, epistemicContext, ADAPTERS, ORIGIN_BY_MODULE };
