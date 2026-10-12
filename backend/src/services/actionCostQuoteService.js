'use strict';

const KINDS = new Set(['none', 'abstain', 'procedure', 'tool', 'small_model',
  'large_model', 'delegation', 'verification']);
const METRICS = ['tokens', 'usd', 'latencyMs'];

function unknownRange() {
  return { min: null, max: null, source: 'unknown' };
}

function rangeOf(value, name) {
  if (value === undefined || value === null) return unknownRange();
  const entry = typeof value === 'number' ? { min: value, max: value } : value;
  if (!entry || typeof entry !== 'object') throw new TypeError(`${name} must be a nonnegative interval.`);
  if (entry.source === 'unknown') return unknownRange();
  return validatedRange(entry, name);
}

function validatedRange(entry, name) {
  if (entry.min === null || entry.max === null) return unknownRange();
  const min = Number(entry.min);
  const max = Number(entry.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    throw new RangeError(`${name} must have finite bounds with 0 <= min <= max.`);
  }
  const source = entry.source || 'estimated';
  if (!['measured', 'estimated'].includes(source)) throw new TypeError(`${name} has invalid provenance.`);
  return { min, max, source };
}

function componentOf(raw, name) {
  const input = raw || {};
  return Object.fromEntries(METRICS.map((metric) => [metric, rangeOf(input[metric], `${name}.${metric}`)]));
}

function zeroComponent() {
  return componentOf({ tokens: 0, usd: 0, latencyMs: 0 }, 'zero');
}

function sumRanges(ranges) {
  if (ranges.some((range) => range.source === 'unknown')) return unknownRange();
  const hasMeasurement = ranges.some((range) => range.source === 'measured');
  const onlyStructuralEstimates = ranges.every((range) => range.source === 'measured'
    || (range.min === 0 && range.max === 0));
  const source = hasMeasurement && onlyStructuralEstimates ? 'measured' : 'estimated';
  const min = ranges.reduce((sum, range) => sum + range.min, 0);
  const max = ranges.reduce((sum, range) => sum + range.max, 0);
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new RangeError('Action cost total overflows.');
  return { min, max, source };
}

function repeatRange(range, count) {
  if (count === 0) return rangeOf(0, 'retry');
  if (range.source === 'unknown' || count === null) return unknownRange();
  return { min: range.min * count, max: range.max * count, source: range.source };
}

function retryCountOf(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('maxRetries must be a nonnegative integer.');
  return value;
}

function inactionRiskOf(raw) {
  const probability = rangeOf(raw?.probability, 'inactionRisk.probability');
  const impact = rangeOf(raw?.impact, 'inactionRisk.impact');
  if (probability.max > 1 || impact.max > 1) throw new RangeError('Inaction risk values must be in [0, 1].');
  if (probability.source === 'unknown' || impact.source === 'unknown') {
    return { probability, impact, expectedLoss: unknownRange() };
  }
  return { probability, impact, expectedLoss: {
    min: probability.min * impact.min,
    max: probability.max * impact.max,
    source: probability.source === 'measured' && impact.source === 'measured' ? 'measured' : 'estimated'
  } };
}

function componentsOf(spec, inactive) {
  const execution = inactive ? zeroComponent() : componentOf(spec.execution, 'execution');
  const verification = inactive ? zeroComponent() : componentOf(spec.verification, 'verification');
  const maxRetries = inactive ? 0 : retryCountOf(spec.maxRetries);
  const retry = maxRetries === 0 ? zeroComponent() : componentOf(spec.retry, 'retry');
  return { execution, verification, retry, maxRetries };
}

function totalsOf(components) {
  const { execution, verification, retry, maxRetries } = components;
  return Object.fromEntries(METRICS.map((metric) => [metric, sumRanges([
    execution[metric], verification[metric], repeatRange(retry[metric], maxRetries)
  ])]));
}

function missingOf(total, maxRetries, inactionRisk) {
  const missing = METRICS.filter((metric) => total[metric].source === 'unknown');
  if (maxRetries === null) missing.push('maxRetries');
  if (inactionRisk?.expectedLoss.source === 'unknown') missing.push('inactionRisk');
  return missing;
}

function quoteActionCost(spec = {}) {
  if (!KINDS.has(spec.kind)) throw new TypeError('Unsupported action kind.');
  const inactive = spec.kind === 'none' || spec.kind === 'abstain';
  const { execution, verification, retry, maxRetries } = componentsOf(spec, inactive);
  const total = totalsOf({ execution, verification, retry, maxRetries });
  const inactionRisk = inactive ? inactionRiskOf(spec.inactionRisk) : null;
  const missing = missingOf(total, maxRetries, inactionRisk);
  return {
    id: spec.id || spec.kind, kind: spec.kind, status: missing.length ? 'incomplete' : 'complete',
    components: { execution, verification, retry }, maxRetries, total,
    reservationRequired: Object.fromEntries(METRICS.map((metric) => [metric, total[metric].max])),
    inactionRisk, missing
  };
}

function hasMaterialInactionRisk(quote) {
  return quote.inactionRisk && quote.inactionRisk.expectedLoss.max > 0;
}

function dominates(left, right) {
  return METRICS.every((metric) => left.total[metric].max <= right.total[metric].min)
    && METRICS.some((metric) => left.total[metric].max < right.total[metric].min);
}

function compareActionCosts(left, right) {
  if (left.status !== 'complete' || right.status !== 'complete') {
    return { relation: 'unknown', reason: 'incomplete_quote' };
  }
  if (hasMaterialInactionRisk(left) || hasMaterialInactionRisk(right)) {
    return { relation: 'incomparable', reason: 'inaction_risk_requires_value_policy' };
  }
  if (dominates(left, right)) return { relation: 'left_lower', reason: 'interval_dominance' };
  if (dominates(right, left)) return { relation: 'right_lower', reason: 'interval_dominance' };
  return { relation: 'incomparable', reason: 'overlap_or_tradeoff' };
}

module.exports = { quoteActionCost, compareActionCosts, KINDS };
