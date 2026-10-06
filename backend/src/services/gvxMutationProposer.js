'use strict';

const { proposeTransformation, validateCandidate } = require('./gvxTransformation');

async function propose(options) {
  const { db, scope, entityId, goal, context, selfTwinPredictor } = options || {};
  if (!goal || typeof selfTwinPredictor !== 'function') throw new Error('mutation-proposal-controls-required');
  const prediction = await selfTwinPredictor({ target: goal.target, intervention: goal.intervention, context });
  if (!prediction?.predictionId || !Array.isArray(prediction.effects)) throw new Error('self-twin-impact-prediction-required');
  const candidate = {
    ...goal.transformation, eventId: options.operationId, scope, entityId,
    hypothesis: { ...goal.transformation.hypothesis,
      prediction: goal.transformation.hypothesis.prediction || JSON.stringify(prediction.effects),
      heldOutRefs: goal.transformation.hypothesis.heldOutRefs || [] },
    causalContext: { selfTwinPredictionId: prediction.predictionId, predictedEffects: prediction.effects }
  };
  const errors = validateCandidate(candidate);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_TRANSFORMATION_INVALID', errors });
  const event = await proposeTransformation(db, candidate);
  return { event, candidate: event.payload.candidate, predictedImpact: prediction, status: 'proposed' };
}

module.exports = { propose };
