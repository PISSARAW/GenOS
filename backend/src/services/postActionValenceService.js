'use strict';

const { actionValue } = require('./valenceService');
const KEYS = ['energy', 'memoryPressure', 'modelDrift', 'contextPressure', 'integrity', 'stress', 'socialState'];

function measuredState(value) {
  return Boolean(value) && KEYS.every((key) => Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1);
}

function predict(input) {
  if (!input?.actionId || !measuredState(input.before) || !measuredState(input.predicted)) {
    return { status: 'insufficient_data', promotionAllowed: false };
  }
  return { status: 'predicted', actionId: input.actionId,
    before: structuredClone(input.before), predicted: structuredClone(input.predicted),
    expectedValue: actionValue(input.before, input.predicted), promotionAllowed: false };
}

function observe(prediction, observation) {
  if (prediction?.status !== 'predicted' || observation?.actionId !== prediction.actionId
    || !measuredState(observation.state)) return { status: 'unmatched', promotionAllowed: false };
  const actualValue = actionValue(prediction.before, observation.state);
  return { status: 'observed', actionId: prediction.actionId, expectedValue: prediction.expectedValue,
    actualValue, predictionError: actualValue - prediction.expectedValue,
    causalAttribution: 'not_established', promotionAllowed: false };
}

module.exports = { predict, observe, measuredState };
