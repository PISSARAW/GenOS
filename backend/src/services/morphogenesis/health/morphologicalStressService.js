'use strict';

const STRESS_SIGNALS = Object.freeze({
  resourceExhaustion: 0.25, latencyExplosion: 0.2, stateInconsistency: 0.25,
  providerOutage: 0.15, criticalFailure: 0.15
});

function signalValue(value) {
  return typeof value === 'boolean' ? Number(value) : Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function assessMorphologicalStress(signals = {}) {
  const scores = Object.fromEntries(Object.entries(STRESS_SIGNALS).map(([key, weight]) => [key, signalValue(signals[key]) * weight]));
  const score = Math.min(1, Object.values(scores).reduce((sum, value) => sum + value, 0));
  return { kind: 'IMMEDIATE_STRESS', score, signals: scores, adaptationRecommended: score >= 0.25 };
}

module.exports = { STRESS_SIGNALS, assessMorphologicalStress };
