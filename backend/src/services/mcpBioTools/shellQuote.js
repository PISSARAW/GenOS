/**
 * GenOS MCP bio-tool CLI quoting helper.
 * Every caller-provided value interpolated into a `genos ...` shell command
 * must go through quoteCliArg: values are wrapped in double quotes with
 * backslashes and quotes escaped, and values containing newlines, carriage
 * returns or NUL bytes are rejected outright (multiline smuggling).
 */

function quoteCliArg(value) {
  const text = String(value === undefined || value === null ? '' : value);
  if (text.includes('\0')) throw new Error('CLI argument contains a NUL byte.');
  if (text.includes('\n')) throw new Error('CLI argument contains a newline.');
  if (text.includes('\r')) throw new Error('CLI argument contains a carriage return.');
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return '"' + escaped + '"';
}

function pickArg(args, keys, fallback) {
  const source = args || {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      if (value) return value;
    }
  }
  return fallback;
}

function pickNumber(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    if (num !== 0) return num;
  }
  return fallback;
}

function hasFlag(args, keys) {
  const source = args || {};
  for (const key of keys) {
    if (source[key]) return true;
  }
  return false;
}

module.exports = { quoteCliArg, pickArg, pickNumber, hasFlag };
