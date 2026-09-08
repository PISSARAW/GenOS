function readInteger(name, value, { defaultValue, min, max }) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function readPort(name, value, defaultValue) {
  return readInteger(name, value, { defaultValue, min: 1, max: 65535 });
}

function readGracePeriod(value, defaultValue = 5000) {
  return readInteger('GENOS_PROCESS_GRACE_MS', value, { defaultValue, min: 0, max: 30000 });
}

module.exports = { readInteger, readPort, readGracePeriod };