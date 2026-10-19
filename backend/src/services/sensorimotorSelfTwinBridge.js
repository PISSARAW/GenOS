'use strict';

const { createHash } = require('node:crypto');
const selfTwin = require('./selfTwin/selfTwinService');
const candidateAdapter = require('./agow/candidates/candidateAdapterService');

const HASH = /^[a-f0-9]{64}$/;

function requireBridgeControls(input) {
  if (input?.authorization?.requiresExplicitAuthorization !== true
      || typeof input.verifyAuthorization !== 'function') throw new Error('sensorimotor-explicit-authorization-required');
  if (typeof input.executeBoundedAction !== 'function'
      || typeof input.observeState !== 'function') throw new Error('sensorimotor-bounded-adapters-required');
  if (!Number.isFinite(input.toleratedError) || input.toleratedError < 0
      || input.toleratedError > 1) throw new Error('sensorimotor-error-threshold-invalid');
}

async function executePredictiveStep(input) {
  requireBridgeControls(input);
  const authorization = await input.verifyAuthorization({ scope: input.scope, step: input.step,
    authorization: input.authorization });
  if (authorization?.authorized !== true || typeof authorization.evidenceRef !== 'string') {
    throw new Error('sensorimotor-authorization-not-verified');
  }
  const prediction = await selfTwin.predict({ db: input.db, scope: input.scope,
    input: input.prediction });
  const observations = observationsFor(prediction);
  const actionResult = await input.executeBoundedAction({ step: input.step,
    authorization: input.authorization, authorizationEvidenceRef: authorization.evidenceRef,
    predictionId: prediction.predictionId });
  const perception = await input.observeState({ step: input.step, actionResult,
    predictionId: prediction.predictionId });
  const measured = observationsForPerception(observations, perception);
  if (!measured.length) {
    throw new Error('sensorimotor-observed-state-required');
  }
  const evidenceRefs = await trustedEvidenceRefs(input, perception.evidenceRefs);
  const record = await selfTwin.observe({ db: input.db, scope: input.scope,
    predictionId: prediction.predictionId, observations: measured, evidenceRefs,
    candidateSubmitter: input.candidateSubmitter || candidateAdapter.submit });
  const discrepancy = record.discrepancy;
  const notification = discrepancy.status === 'measured' && discrepancy.epsilon > input.toleratedError
    ? await notifyShev({ input, discrepancy, record, prediction }) : null;
  return { prediction, actionResult, perception, record, notification,
    authorizationEvidenceRef: authorization.evidenceRef,
    discrepancy, requiresExplicitAuthorization: true, promotionEligible: false };
}

function observationsFor(prediction) {
  const effects = (prediction.effects || []).filter((effect) => typeof effect.metric === 'string'
    && Number.isFinite(effect.expected));
  if (!effects.length) throw new Error('sensorimotor-numeric-prediction-contract-required');
  return new Map(effects.map((effect) => [effect.metric, effect.expected]));
}

function observationsForPerception(prediction, perception) {
  const measurements = perception?.metrics || perception?.observations || [];
  if (!Array.isArray(measurements)) return [];
  return [...prediction].flatMap(([metric, predicted]) => {
    const measured = measurements.find((item) => item.metric === metric);
    return Number.isFinite(measured?.observed) ? [{ metric, predicted, observed: measured.observed }] : [];
  });
}

async function trustedEvidenceRefs(input, refs) {
  if (typeof input.verifyEvidenceRefs !== 'function' || !Array.isArray(refs)) return [];
  const verified = await input.verifyEvidenceRefs(refs);
  return Array.isArray(verified) ? verified.filter((item) => item?.verified === true
    && HASH.test(item.artifactHash || '')).map((item) => item.artifactHash) : [];
}

async function notifyShev({ input, discrepancy, record, prediction }) {
  const kind = input.prediction?.semanticType === 'capability_gap' ? 'capability_gap' : 'degradation';
  const event = { kind, predictionId: prediction.predictionId,
    observationId: record.observationId, predictionError: discrepancy.epsilon,
    evidenceRefs: record.evidenceRefs, promotionEligible: false };
  if (typeof input.notifyShev === 'function') return input.notifyShev(event);
  return persistShevObservation(input, event);
}

async function persistShevObservation(input, event) {
  if (!input.shevDimension || !input.db || !event.evidenceRefs.length) {
    return { status: 'deferred', reason: 'shev-scope-or-verified-evidence-missing' };
  }
  const digest = createHash('sha256').update(`${event.predictionId}\0${event.observationId}`).digest('hex');
  try {
    const observation = await require('./shev/observationService').recordObservation(input.db, {
      id: `sensorimotor:${digest}`, projectId: input.scope.projectId,
      domain: input.shevDomain || 'desktop', dimension: input.shevDimension,
      kind: event.kind, epistemicStatus: 'observed', source: 'sensorimotor-self-twin',
      observedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(),
      summary: `Erreur de prédiction sensorimotrice ${event.predictionError.toFixed(4)}.`,
      evidenceRefs: event.evidenceRefs
    });
    return { status: 'recorded', observationId: observation.id,
      promotionEligible: false };
  } catch (error) {
    return { status: 'deferred', reason: error.code || 'shev-observation-rejected' };
  }
}

module.exports = { executePredictiveStep };
