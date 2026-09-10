function normalizeBounds(fallbackOrOptions, bounds) {
  return typeof fallbackOrOptions === 'object'
    ? fallbackOrOptions
    : { fallback: fallbackOrOptions, minimum: bounds[0], maximum: bounds[1] };
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function isNumericString(value) {
  return typeof value !== 'string' || /^-?\d+$/.test(value.trim());
}

function isInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function boundedInteger(value, fallbackOrOptions, ...bounds) {
  const options = normalizeBounds(fallbackOrOptions, bounds);
  const { fallback, minimum, maximum } = options;
  if (isMissing(value) || !isNumericString(value)) return fallback;
  const numeric = Number(value);
  if (!isInRange(numeric, minimum, maximum)) return fallback;
  return numeric;
}

function jobMaxAttempts(value, fallback = 3) {
  return boundedInteger(value, { fallback, minimum: 1, maximum: 10 });
}

function jobTimeoutMs(value, fallback = 30000) {
  return boundedInteger(value, { fallback, minimum: 1, maximum: 30 * 60 * 1000 });
}

function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value === undefined ? null : value), 'utf8');
}

module.exports = { boundedInteger, jobMaxAttempts, jobTimeoutMs, jsonByteLength };
