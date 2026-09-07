function boundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) return fallback;
  return numeric;
}

function jobMaxAttempts(value, fallback = 3) {
  return boundedInteger(value, fallback, 1, 10);
}

function jobTimeoutMs(value, fallback = 30000) {
  return boundedInteger(value, fallback, 1, 30 * 60 * 1000);
}

function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value === undefined ? null : value), 'utf8');
}

module.exports = { boundedInteger, jobMaxAttempts, jobTimeoutMs, jsonByteLength };
