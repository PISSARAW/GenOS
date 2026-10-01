'use strict';

const valence = require('../valenceService');

function totalWeight() {
  return Object.values(valence.DEFAULT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
}

function normalizedDistance(variables) {
  return Math.max(0, Math.min(1, valence.driveOf(variables).distance / totalWeight()));
}

function evaluate(candidate, context = {}) {
  const predicted = candidate.epistemicContext?.expectedAllostaticState;
  const current = context.currentInteroception;
  if (!current || !predicted) return { expectedLossIfIgnored: 0, expectedLossIfAttended: 0, regret: 0, confidence: 0, preempt: false, available: false };
  const ignored = normalizedDistance(current);
  const attended = normalizedDistance(predicted);
  const repair = ignored - attended;
  const catastropheThreshold = Math.max(0, Math.min(1, Number(context.catastropheThreshold) || 0.8));
  const confidence = candidate.measures.causalConfidence;
  return {
    expectedLossIfIgnored: ignored, expectedLossIfAttended: attended,
    regret: Math.max(0, Math.min(1, repair)), confidence,
    preempt: ignored >= catastropheThreshold && repair >= 0.15 && confidence >= 0.5,
    available: true
  };
}

module.exports = { evaluate, normalizedDistance };
