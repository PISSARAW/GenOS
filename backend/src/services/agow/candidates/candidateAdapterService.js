'use strict';

const { createHash } = require('node:crypto');
const workspace = require('../../globalWorkspaceService');

const ADAPTERS = Object.freeze({
  perception: 'observation', world_model: 'world_state', memory: 'memory_retrieval', self: 'self_state',
  metacognition: 'reliability_estimate', interoception: 'resource_state', epistemic: 'belief_state',
  worker: 'worker_result', daemon: 'daemon_event', efference: 'action_consequence',
  morphogenesis: 'morphogenesis_proposal'
});

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

function build(options) {
  const { observation, agentId, module, now = Date.now() } = options;
  const evidenceRefs = Array.isArray(observation.evidenceRefs) ? observation.evidenceRefs.filter((value) => typeof value === 'string') : [];
  return {
    candidateId: String(observation.candidateId || `${module}:${agentId}:${now}`), agentId,
    source: { module, instanceId: observation.instanceId || null, modality: ADAPTERS[module] || 'organ_observation' },
    content: buildContent(observation, module),
    evidenceRefs, causalParents: Array.isArray(observation.causalParents) ? observation.causalParents.filter((value) => typeof value === 'string') : [],
    measures: buildMeasures(observation), constraints: buildConstraints(observation),
    redundancyKey: observation.redundancyKey || null, producedAt: now,
    expiresAt: now + Math.max(1000, Number(observation.ttlMs) || 60000),
    stateHash: String(observation.stateHash || createHash('sha256').update(JSON.stringify(observation)).digest('hex'))
  };
}

async function submit(options) {
  const module = options?.module;
  if (!Object.hasOwn(ADAPTERS, module)) return { accepted: false, reason: 'unknown_candidate_source' };
  const candidate = build({ ...options, now: Number(options.now) || Date.now() });
  return workspace.submitCandidate({ candidate, now: candidate.producedAt, db: options.db,
    activeGoal: options.activeGoal, unresolvedQuestions: options.unresolvedQuestions, triggerCycle: options.triggerCycle });
}

module.exports = { submit, build, ADAPTERS };
