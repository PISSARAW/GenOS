function boundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) return fallback;
  return numeric;
}

module.exports = { boundedInteger };
