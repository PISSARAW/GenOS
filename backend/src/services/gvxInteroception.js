'use strict';

const crypto = require('crypto');

const SIGNALS = Object.freeze([
  'memoryPressure', 'budgetRatio', 'errorRate', 'evidenceIntegrity',
  'securityAnomalies', 'calibrationError', 'coordinationLoad'
]);
const STATUS = Object.freeze(['measured', 'unknown', 'stale', 'invalid']);

function normalizeMeasurement(signal, measurement) {
  if (isMissing(measurement)) {
    return { value: null, status: 'unknown', source: measurement?.source || null, measuredAt: null };
  }
  const valid = validValue(measurement.value) && validSource(measurement.source) && validTimestamp(measurement.measuredAt);
  return {
    value: valid ? measurement.value : null,
    status: valid ? 'measured' : 'invalid',
    source: typeof measurement.source === 'string' ? measurement.source : null,
    measuredAt: valid && typeof measurement.measuredAt === 'string' ? measurement.measuredAt : null,
    signal
  };
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
  const measurements = input.measurements || {};
  const dimensions = Object.fromEntries(SIGNALS.map((signal) => [
    signal, normalizeMeasurement(signal, measurements[signal])
  ]));
  return {
    schema: 'genos.gvx.interoception/v1',
    snapshotId: crypto.randomUUID(),
    scope: { ...input.scope },
    createdAt: new Date().toISOString(),
    dimensions
  };
}

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

module.exports = { SIGNALS, STATUS, buildInteroceptiveState, evaluateViability };
