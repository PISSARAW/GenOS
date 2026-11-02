'use strict';

const { FRESH_MS } = require('./physiology');
const { identifier, scopeKey } = require('./contract');

function forecast(samples, policy) {
  const recent = samples.slice(0, 3);
  if (recent.length < 3) return null;
  const [last, middle, first] = recent;
  if (last.observedAt - first.observedAt > FRESH_MS || first.observedAt >= middle.observedAt) return null;
  if (middle.observedAt >= last.observedAt || last.observedAt - first.observedAt < 1000) return null;
  if (recent.some(sample => sample.capacity !== last.capacity || sample.managerId !== last.managerId)) return null;
  if (middle.pressure <= first.pressure || last.pressure <= middle.pressure) return null;
  const slope = (last.pressure - first.pressure) / (last.observedAt - first.observedAt);
  const pressure = Math.min(1, last.pressure + slope * policy.horizonMs);
  return { model: 'bounded-linear-v1', pressure, horizonMs: policy.horizonMs,
    highThreshold: policy.highThreshold, policyVersion: policy.version,
    sampleIds: recent.map(sample => sample.id), observedAt: last.observedAt,
    evidenceStatus: 'PREDICTED_UNVERIFIED' };
}

function predictiveActions(signal, result) {
  if (result.disposition === 'HISTORICAL' || result.actions.includes('INHIBIT_DISPATCH')) return [];
  if (signal.regulationPolicy && signal.pressure >= signal.regulationPolicy.highThreshold) return ['INHIBIT_DISPATCH'];
  const prediction = signal.regulationForecast;
  if (!prediction) return [];
  if (prediction.pressure < prediction.highThreshold) return [];
  return ['INHIBIT_DISPATCH'];
}

function validatePolicy(value) {
  if (!Number.isSafeInteger(value?.version) || value.version < 1) throw new Error('GNS_INVALID_POLICY');
  bounded(value.highThreshold, [0.7, 0.95]);
  return { version: value.version, highThreshold: value.highThreshold };
}

function validateForecast(value, observed) {
  if (!value) return null;
  if (value.observedAt !== observed.observedAt || value.model !== 'bounded-linear-v1') throw new Error('GNS_INVALID_FORECAST');
  bounded(value.pressure, [observed.pressure, 1]);
  bounded(value.highThreshold, [0.7, 0.95]);
  bounded(value.horizonMs, [1000, 10000]);
  if (!Number.isSafeInteger(value.horizonMs) || !Number.isSafeInteger(value.policyVersion)) throw new Error('GNS_INVALID_FORECAST');
  if (!Array.isArray(value.sampleIds) || value.sampleIds.length !== 3) throw new Error('GNS_INVALID_FORECAST');
  value.sampleIds.forEach(id => identifier(id, 'sampleId'));
  return JSON.parse(JSON.stringify(value));
}

function bounded(value, bounds) {
  if (!Number.isFinite(value) || value < bounds[0] || value > bounds[1]) throw new Error('GNS_INVALID_FORECAST');
}

function calibrate(policy, episodes) {
  const completed = episodes.filter(row => samePolicy(row, policy))
    .filter(row => ['RECOVERY_OBSERVED', 'REGRESSED'].includes(row.status)).slice(0, 20);
  if (completed.length < 10) return { status: 'INSUFFICIENT_EVIDENCE', minimumEpisodes: 10, automaticApply: false };
  const regressions = completed.filter(row => row.status === 'REGRESSED').length;
  const delta = regressions > completed.length / 4 ? 0.02 : 0;
  return { status: 'PROPOSAL', highThreshold: Math.min(0.95, Math.max(0.7, policy.highThreshold + delta)),
    basedOn: completed.map(row => row.effect_id), automaticApply: false,
    requiresNewSignedPolicy: true, causalAttribution: 'NOT_ESTABLISHED' };
}

function samePolicy(row, policy) {
  try {
    const recorded = JSON.parse(row.body_json).policy;
    return recorded.version === policy.version && recorded.managerId === policy.managerId
      && scopeKey(recorded.scope) === scopeKey(policy.scope);
  } catch (_) { return false; }
}

module.exports = { forecast, predictiveActions, validateForecast, validatePolicy, calibrate };
