'use strict';

const METRICS = Object.freeze({
  inputTokens: ['input_tokens', 'tokens'],
  cacheCreationTokens: ['cache_creation_tokens', 'tokens'],
  cacheReadTokens: ['cache_read_tokens', 'tokens'],
  outputTokens: ['output_tokens', 'tokens'],
  billableTokens: ['billable_tokens', 'tokens'],
  catalogCostUsd: ['catalog_cost_usd', 'usd'],
  billedCostUsd: ['billed_cost_usd', 'usd'],
  toolCostUsd: ['tool_cost_usd', 'usd'],
  runtimeCostUsd: ['runtime_cost_usd', 'usd'],
  activeTimeMs: ['active_time_ms', 'milliseconds'],
  wallTimeMs: ['wall_time_ms', 'milliseconds']
});

const SOURCES = new Set(['exact', 'provider_receipt', 'estimated', 'unavailable']);

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalText(value, field) {
  if (value == null) return null;
  return requiredText(value, field);
}

function normalizeTime(value, field) {
  if (value == null) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${field} must be an ISO-8601 timestamp.`);
  return new Date(parsed).toISOString();
}

function normalizeValue(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field}.value must be a finite non-negative number.`);
  }
  return value;
}

function normalizeMeasurement(name, measurement) {
  if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement)) {
    throw new TypeError(`${name} must declare a value and its source.`);
  }
  if (!SOURCES.has(measurement.source)) throw new TypeError(`${name}.source is invalid.`);
  const normalized = {
    metric: METRICS[name][0], unit: METRICS[name][1], source: measurement.source,
    value: measurement.source === 'unavailable' ? null : normalizeValue(measurement.value, name),
    evidenceRef: optionalText(measurement.evidenceRef, `${name}.evidenceRef`),
    estimationMethod: optionalText(measurement.estimationMethod, `${name}.estimationMethod`),
    unavailableReason: optionalText(measurement.unavailableReason, `${name}.unavailableReason`)
  };
  enforceProvenance(name, normalized);
  return normalized;
}

function enforceProvenance(name, measurement) {
  if (measurement.source === 'unavailable' && measurement.unavailableReason === null) {
    throw new TypeError(`${name}.unavailableReason is required for unavailable measurements.`);
  }
  if (measurement.source === 'provider_receipt' && measurement.evidenceRef === null) {
    throw new TypeError(`${name}.evidenceRef is required for provider receipts.`);
  }
  if (measurement.source === 'estimated' && measurement.estimationMethod === null) {
    throw new TypeError(`${name}.estimationMethod is required for estimates.`);
  }
}

function normalizeMeasurements(measurements) {
  if (!measurements || typeof measurements !== 'object' || Array.isArray(measurements)) {
    throw new TypeError('measurements must be an object.');
  }
  const unknown = Object.keys(measurements).filter((name) => !METRICS[name]);
  if (unknown.length) throw new TypeError(`Unknown metabolic metrics: ${unknown.join(', ')}.`);
  const entries = Object.entries(measurements).map(([name, value]) => normalizeMeasurement(name, value));
  if (!entries.length) throw new TypeError('At least one metabolic measurement is required.');
  return entries;
}

function normalizeMetadata(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('metadata must be an object.');
  return value;
}

function normalizeObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('A metabolic observation object is required.');
  }
  const startedAt = normalizeTime(input.startedAt, 'startedAt');
  const finishedAt = normalizeTime(input.finishedAt, 'finishedAt');
  if (startedAt && finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
    throw new TypeError('finishedAt must not precede startedAt.');
  }
  return {
    id: requiredText(input.id, 'id'), missionId: requiredText(input.missionId, 'missionId'),
    threadId: optionalText(input.threadId, 'threadId'),
    organizationId: optionalText(input.organizationId, 'organizationId'),
    projectId: optionalText(input.projectId, 'projectId'),
    provider: optionalText(input.provider, 'provider'), model: optionalText(input.model, 'model'),
    operationId: optionalText(input.operationId, 'operationId'), startedAt, finishedAt,
    observedAt: normalizeTime(input.observedAt || new Date().toISOString(), 'observedAt'),
    metadata: normalizeMetadata(input.metadata), measurements: normalizeMeasurements(input.measurements)
  };
}

module.exports = { METRICS, SOURCES, normalizeObservation };
