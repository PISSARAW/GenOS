function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function safeGet(object, key) {
  return object ? object[key] : undefined;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseJson(value, fallback = '{}') {
  try {
    return JSON.parse(value || fallback);
  } catch (_) {
    return JSON.parse(fallback);
  }
}

async function assertNotCancelled(db, table, options) {
  const current = await db.get(`SELECT status FROM ${table} WHERE id = ?`, options.id);
  if (current?.status === 'cancelled') throw codedError(options.message, options.code);
}

module.exports = {
  firstTruthy,
  firstNonNull,
  safeGet,
  codedError,
  parseJson,
  assertNotCancelled
};
