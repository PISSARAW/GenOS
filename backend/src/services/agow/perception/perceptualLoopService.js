'use strict';

const { createHash } = require('node:crypto');
const bindingService = require('../../perceptiveBindingService');
const generativeService = require('../../generativePerceptualService');
const predictiveHierarchy = require('../../predictiveHierarchyService');
const stateStore = require('./perceptualStateStore');
const feedbackService = require('./workspacePerceptualFeedbackService');
const workspaceService = require('../../globalWorkspaceService');

function errorMagnitude(errors) {
  if (!errors.length) return 0;
  return Math.min(1, errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length);
}

function candidateFor(options) {
  const { agentId, now, error, uncertainty, bindings, stateHash } = options;
  return {
    candidateId: `perception:${agentId}:${now}`, agentId,
    source: { module: 'perception', instanceId: null, modality: 'observation' },
    content: { semanticType: 'prediction_error', artifactRef: null, compactPreview: `${bindings.length} percept bindings; error=${error.toFixed(3)}` },
    epistemicOrigin: { origin: 'external_observed', realityMode: 'real', agency: 'environment', simulationId: null, parentRealityFrameId: null },
    evidenceRefs: bindings.map((binding) => binding.id), causalParents: options.frameId ? [options.frameId] : [],
    measures: { predictionError: error, uncertainty, goalRelevance: options.goalMatched ? 0.7 : 0.2, expectedInformationGain: Math.min(1, error + uncertainty * 0.5), urgency: error >= 0.5 ? 0.8 : 0.2, novelty: Math.min(1, bindings.length / 10), actionability: error > 0.25 ? 0.8 : 0.2, causalConfidence: Math.max(0, 1 - uncertainty), evidenceDebt: uncertainty, estimatedCost: 0 },
    constraints: { safety: 'clear', integrity: 'clear', viability: 'clear', userPolicy: 'clear' },
    redundancyKey: `prediction:${options.frameId || 'initial'}`, producedAt: now, expiresAt: now + 60000, stateHash
  };
}

async function process(options) {
  const now = Number(options.now) || Date.now();
  const priorState = await stateStore.get({ agentId: options.agentId, db: options.db });
  const feedback = await feedbackService.feedback({ ...options, prior: priorState.posterior });
  const prediction = generativeService.predictHierarchy({ prior: feedback.prior, priors: options.priors, observations: options.observation.levels, observation: options.observation.vector, precision: feedback.precision });
  const percepts = bindingService.recurrentUpdate(priorState.bindings, options.observation);
  const error = Math.max(prediction.predictionError, errorMagnitude(prediction.hierarchy.object.error));
  const uncertainty = Math.max(0, Math.min(1, 1 - prediction.hierarchy.object.precision));
  const nextState = { bindings: percepts.bindings, posterior: prediction.posterior, lastFrameId: feedback.frameId, cycle: priorState.cycle + 1, updatedAt: now };
  await stateStore.save({ agentId: options.agentId, db: options.db, state: nextState });
  const stateHash = createHash('sha256').update(JSON.stringify(nextState)).digest('hex');
  const candidate = error > (Number(options.errorThreshold) || 0.25)
    ? candidateFor({ agentId: options.agentId, now, error, uncertainty, bindings: percepts.bindings, frameId: feedback.frameId, stateHash, goalMatched: options.goalMatched })
    : null;
  const submission = candidate ? await workspaceService.submitCandidate({ candidate, now, db: options.db }) : null;
  const errorRoute = candidate ? await predictiveHierarchy.routeEvent(options.db, options.agentId, { eventType: 'PERCEPTUAL_ERROR', severity: error >= 0.75 ? 'critical' : 'warning' }) : null;
  return { prediction, perceptGraph: percepts.graph, predictionError: error, recurrence: percepts.recurrence, stateHash, candidate, submission, errorRoute };
}

module.exports = { process };
