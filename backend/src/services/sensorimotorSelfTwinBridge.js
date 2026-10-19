'use strict';

const selfTwin = require('./selfTwin/selfTwinService');
const candidateAdapter = require('./agow/candidates/candidateAdapterService');

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
  const actionResult = await input.executeBoundedAction({ step: input.step,
    authorization: input.authorization, authorizationEvidenceRef: authorization.evidenceRef,
    predictionId: prediction.predictionId });
  const perception = await input.observeState({ step: input.step, actionResult,
    predictionId: prediction.predictionId });
  if (!Array.isArray(perception?.observations) || perception.observations.length === 0) {
    throw new Error('sensorimotor-observed-state-required');
  }
  const record = await selfTwin.observe({ db: input.db, scope: input.scope,
    predictionId: prediction.predictionId, observations: perception.observations,
    evidenceRefs: perception.evidenceRefs || [],
    candidateSubmitter: input.candidateSubmitter || candidateAdapter.submit });
  const discrepancy = record.discrepancy;
  const notification = discrepancy.status === 'measured' && discrepancy.epsilon > input.toleratedError
    ? await notifyShev({ input, discrepancy, record, prediction }) : null;
  return { prediction, actionResult, perception, record, notification,
    authorizationEvidenceRef: authorization.evidenceRef,
    discrepancy, requiresExplicitAuthorization: true, promotionEligible: false };
}

async function notifyShev({ input, discrepancy, record, prediction }) {
  if (typeof input.notifyShev !== 'function') return { status: 'deferred', reason: 'shev-adapter-missing' };
  const kind = input.prediction?.semanticType === 'capability_gap' ? 'capability_gap' : 'degradation';
  return input.notifyShev({ kind, predictionId: prediction.predictionId,
    observationId: record.observationId, predictionError: discrepancy.epsilon,
    evidenceRefs: record.evidenceRefs, promotionEligible: false });
}

module.exports = { executePredictiveStep };
