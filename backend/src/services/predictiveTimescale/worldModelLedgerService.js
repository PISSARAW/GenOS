'use strict';

const { randomUUID } = require('node:crypto');
const { AdaptiveStateService } = require('../adaptiveStateService');
const { predictionCommitment, verifyObservationEnvelope } = require('./worldModelEnvelope');
const learning = require('./worldModelLearningService');

const SCOPE = 'world_model_ledger_v1';

function emptyState() {
  return { predictions: {}, predictionVersions: {}, observations: {},
    episodes: {}, semanticMemory: {}, assumptionLedger: {} };
}

function ensureState(state) {
  return { ...emptyState(), ...(state || {}), predictions: { ...(state?.predictions || {}) },
    predictionVersions: { ...(state?.predictionVersions || {}) }, observations: { ...(state?.observations || {}) } };
}

function requireText(input, field) {
  if (typeof input?.[field] !== 'string' || !input[field].trim()) throw new Error(`prediction-${field}-required`);
  return input[field].trim();
}

function bounded(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`prediction-${field}-invalid`);
  return value;
}

function validatePrediction(input) {
  const prediction = {
    predictionKey: requireText(input, 'predictionKey'), metric: requireText(input, 'metric'),
    modelId: requireText(input, 'modelId'), contextKey: requireText(input, 'contextKey'),
    actionRef: requireText(input, 'actionRef'), trajectoryId: requireText(input, 'trajectoryId'),
    projectId: requireText(input, 'projectId'), responsibleAgentId: requireText(input, 'responsibleAgentId'),
    mean: Number(input.mean), variance: Number(input.variance), confidence: bounded(input.confidence, 'confidence'),
    falsificationTolerance: Number(input.falsificationTolerance),
    assumptionIds: [...new Set(input.assumptionIds || [])], evidenceRefs: [...new Set(input.evidenceRefs || [])]
  };
  if (input.actionState !== 'PLANNED') throw new Error('prediction-must-precede-action');
  if (!Number.isFinite(prediction.mean) || !Number.isFinite(prediction.variance) || prediction.variance < 0) {
    throw new Error('prediction-distribution-invalid');
  }
  if (!Number.isFinite(prediction.falsificationTolerance) || prediction.falsificationTolerance <= 0) {
    throw new Error('prediction-tolerance-invalid');
  }
  return prediction;
}

function buildPrediction(state, input, options) {
  const valid = validatePrediction(input);
  const version = (state.predictionVersions[valid.predictionKey] || 0) + 1;
  const prediction = { ...valid, predictionId: options.randomId(), version,
    issuedAt: options.now(), status: 'OPEN', observationId: null };
  prediction.commitment = predictionCommitment(prediction);
  return prediction;
}

async function preregister(options) {
  if (!options?.db || !options.agentId) throw new Error('world-model-store-required');
  const store = new AdaptiveStateService(options.db);
  const state = ensureState(await store.restoreObject(SCOPE, options.agentId));
  const prediction = buildPrediction(state, options.input || {}, {
    now: options.now || (() => new Date().toISOString()), randomId: options.randomId || randomUUID
  });
  state.predictions[prediction.predictionId] = prediction;
  state.predictionVersions[prediction.predictionKey] = prediction.version;
  await store.persistObject(SCOPE, options.agentId, state, prediction.version);
  return prediction;
}

function validateObservation(prediction, envelope) {
  const verified = verifyObservationEnvelope(envelope);
  const payload = verified.payload;
  if (prediction.status !== 'OPEN') throw new Error('prediction-already-observed');
  if (payload.predictionId !== prediction.predictionId || payload.version !== prediction.version) {
    throw new Error('observation-prediction-mismatch');
  }
  if (!Number.isFinite(payload.value)) throw new Error('observation-value-invalid');
  if (!payload.observedAt || Date.parse(payload.observedAt) < Date.parse(prediction.issuedAt)) {
    throw new Error('observation-precedes-prediction');
  }
  if (!Array.isArray(payload.evidenceRefs) || payload.evidenceRefs.length === 0) {
    throw new Error('observation-evidence-required');
  }
  return { ...payload, signerFingerprint: verified.signerFingerprint };
}

async function observe(options) {
  if (!options?.db || !options.agentId) throw new Error('world-model-store-required');
  const store = new AdaptiveStateService(options.db);
  const state = ensureState(await store.restoreObject(SCOPE, options.agentId));
  const prediction = state.predictions[options.envelope?.payload?.predictionId];
  if (!prediction) throw new Error('prediction-not-found');
  const payload = validateObservation(prediction, options.envelope);
  const observationId = options.observationId || randomUUID();
  const residual = payload.value - prediction.mean;
  const observation = { ...payload, observationId, signerFingerprint: payload.signerFingerprint,
    predictionCommitment: prediction.commitment, residual,
    standardizedResidual: residual / Math.sqrt(Math.max(prediction.variance, 1e-9)) };
  state.observations[observationId] = observation;
  state.predictions[prediction.predictionId] = { ...prediction, status: 'OBSERVED', observationId };
  const memory = learning.learn(state, prediction, observation);
  await store.persistObject(SCOPE, options.agentId, state, prediction.version);
  return { prediction: state.predictions[prediction.predictionId], observation, memory };
}

async function getState(db, agentId) {
  return ensureState(await new AdaptiveStateService(db).restoreObject(SCOPE, agentId));
}

module.exports = { SCOPE, emptyState, ensureState, preregister, observe, getState,
  validatePrediction, validateObservation, buildPrediction };
