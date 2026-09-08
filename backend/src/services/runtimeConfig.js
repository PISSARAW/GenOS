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

function readSqliteMmapSize(value) {
  return readInteger('GENOS_SQLITE_MMAP_SIZE', value, { defaultValue: 268435456, min: 0, max: 1073741824 });
}

function readSqliteSynchronous(value) {
  const mode = String(value || 'FULL').trim().toUpperCase();
  if (!['NORMAL', 'FULL', 'EXTRA'].includes(mode)) {
    throw new Error('GENOS_SQLITE_SYNCHRONOUS must be NORMAL, FULL, or EXTRA.');
  }
  return mode;
}

module.exports = { readInteger, readPort, readGracePeriod, readSqliteMmapSize, readSqliteSynchronous };