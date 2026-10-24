'use strict';

function average(values) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('values must be finite numbers');
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('values must be finite numbers');
  if (!Number.isFinite(p) || p < 0 || p > 100) throw new RangeError('p must be between 0 and 100');
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((p / 100) * sorted.length)] ?? null;
}

function summary(values) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('values must be finite numbers');
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    sum,
    average: values.length ? sum / values.length : 0,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null
  };
}

module.exports = { average, percentile, summary };
