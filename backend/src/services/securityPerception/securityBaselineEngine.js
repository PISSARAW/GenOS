'use strict';

const { digest } = require('./securityPerceptionPrimitives');

function signature(observation) {
  return [observation.sensorId, observation.subject, observation.signal].join('|');
}

function learn(state, observation, options = {}) {
  const key = signature(observation);
  const previous = state.baselines[key] || { count: 0, values: {}, lastUpdatedAt: null };
  const nextValues = { ...previous.values, [String(observation.value)]: (previous.values[String(observation.value)] || 0) + 1 };
  const count = previous.count + 1;
  if (options.confirmedNormal !== true) return previous;
  const baseline = { count, values: nextValues, lastUpdatedAt: observation.observedAt, fingerprint: digest(nextValues) };
  state.baselines[key] = baseline;
  return baseline;
}

function deviation(state, observation) {
  const baseline = state.baselines[signature(observation)];
  if (!baseline || baseline.count < 3) return null;
  const frequency = (baseline.values[String(observation.value)] || 0) / baseline.count;
  return { baselineCount: baseline.count, expectedFrequency: frequency, deviation: 1 - frequency,
    significant: frequency < 0.1 };
}

module.exports = { signature, learn, deviation };
