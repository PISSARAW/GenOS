const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

function maxOutputBytes(value = process.env.GENOS_MAX_PROCESS_OUTPUT_BYTES) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_OUTPUT_BYTES;
}

function appendBounded(current, chunk, limit = maxOutputBytes()) {
  const next = `${current || ''}${chunk || ''}`;
  return next.length <= limit ? next : next.slice(-limit);
}

module.exports = { DEFAULT_MAX_OUTPUT_BYTES, maxOutputBytes, appendBounded };
