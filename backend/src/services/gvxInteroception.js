'use strict';

const crypto = require('crypto');

const SIGNALS = Object.freeze([
  'memoryPressure', 'budgetRatio', 'errorRate', 'evidenceIntegrity',
  'securityAnomalies', 'calibrationError', 'coordinationLoad'
]);
const STATUS = Object.freeze(['measured', 'unknown', 'stale', 'invalid']);
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function normalizeMeasurement(signal, measurement, policy) {
  if (isMissing(measurement)) {
    return { value: null, status: 'unknown', source: measurement?.source || null, measuredAt: null };
  }
  const checked = measurementFreshness(measurement, policy);
  return {
    value: checked.valid ? measurement.value : null,
    status: checked.status,
    source: typeof measurement.source === 'string' ? measurement.source : null,
    measuredAt: checked.valid ? checked.measuredAt : null,
    signal
  };
}

function measurementFreshness(measurement, policy) {
  const measuredAt = measurement.measuredAt || policy.observedAt;
  const timestamp = Date.parse(measuredAt);
  const age = Date.parse(policy.now) - timestamp;
  const valid = validValue(measurement.value) && validSource(measurement.source)
    && validTimestamp(measuredAt) && age >= 0;
  return { valid, measuredAt, status: !valid ? 'invalid' : age > policy.maxAgeMs ? 'stale' : 'measured' };
}

function isMissing(measurement) {
  return !measurement || measurement.value === null || measurement.value === undefined;
}

function validValue(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validSource(source) { return typeof source === 'string' && Boolean(source.trim()); }
function validTimestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }

function buildInteroceptiveState(input) {
  validateScope(input.scope);
  const policy = freshnessPolicy(input);
  const measurements = input.measurements || {};
  const dimensions = Object.fromEntries(SIGNALS.map((signal) => [
    signal, normalizeMeasurement(signal, measurements[signal], policy)
  ]));
  return {
    schema: 'genos.gvx.interoception/v1',
    snapshotId: crypto.randomUUID(),
    scope: { ...input.scope },
    createdAt: new Date().toISOString(),
    dimensions
  };
}

function freshnessPolicy(input) {
  const supplied = input.freshnessPolicy || {};
  const maxAgeMs = Number(supplied.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  if (!validMaxAge(maxAgeMs)) throw policyError('gvx-interoception-max-age-invalid');
  const now = supplied.now ?? input.now ?? new Date().toISOString();
  const observedAt = supplied.observedAt ?? null;
  if (!validClock(now, observedAt)) throw policyError('gvx-interoception-clock-invalid');
  return { maxAgeMs, now: new Date(Date.parse(now)).toISOString(),
    observedAt: observedAt ? new Date(Date.parse(observedAt)).toISOString() : null };
}

function validMaxAge(value) { return Number.isFinite(value) && value >= 0; }
function validClock(now, observedAt) {
  return Number.isFinite(Date.parse(now)) && (!observedAt || Number.isFinite(Date.parse(observedAt)));
}
function policyError(message) { return Object.assign(new Error(message), { code: 'GVX_INTEROCEPTION_POLICY_INVALID' }); }

function validateScope(scope) {
  if (!scope || typeof scope.organizationId !== 'string' || !scope.organizationId.trim()
    || typeof scope.projectId !== 'string' || !scope.projectId.trim()) {
    throw Object.assign(new Error('gvx-scope-required'), { code: 'GVX_SCOPE_REQUIRED' });
  }
}

function evaluateViability(state, profile) {
  validateProfile(profile);
  const results = profile.rules.map((rule) => evaluateRule(state, rule));
  const failed = results.some((result) => result.status === 'failed');
  const unknown = results.some((result) => result.status === 'unknown');
  return {
    profileId: profile.id,
    profileVersion: profile.version,
    status: failed ? 'outside_envelope' : unknown ? 'inconclusive' : 'viable',
    results
  };
}

function validateProfile(profile) {
  if (!validProfile(profile)) {
    throw Object.assign(new Error('gvx-viability-profile-invalid'), { code: 'GVX_PROFILE_INVALID' });
  }
  if (profile.rules.some((rule) => !validRule(rule)))
    throw Object.assign(new Error('gvx-viability-rule-invalid'), { code: 'GVX_RULE_INVALID' });
}

function validProfile(profile) {
  return Boolean(profile && profile.id && Number.isInteger(profile.version) && Array.isArray(profile.rules));
}

function validRule(rule) {
  return validSignal(rule.signal) && validOperator(rule.operator) && validThreshold(rule.threshold);
}

function validSignal(signal) { return SIGNALS.includes(signal); }
function validOperator(operator) { return ['lte', 'gte', 'eq'].includes(operator); }
function validThreshold(value) { return Number.isFinite(value) && value >= 0 && value <= 1; }

function evaluateRule(state, rule) {
  const measurement = state.dimensions[rule.signal];
  if (measurement.status !== 'measured') {
    return { signal: rule.signal, status: 'unknown', observed: measurement.value, required: rule };
  }
  return {
    signal: rule.signal,
    status: satisfies(measurement.value, rule) ? 'passed' : 'failed',
    observed: measurement.value,
    required: rule
  };
}

function satisfies(value, rule) {
  if (rule.operator === 'lte') return value <= rule.threshold;
  if (rule.operator === 'gte') return value >= rule.threshold;
  return value === rule.threshold;
}

module.exports = { SIGNALS, STATUS, DEFAULT_MAX_AGE_MS, buildInteroceptiveState, evaluateViability, normalizeMeasurement };
