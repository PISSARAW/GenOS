'use strict';

const crypto = require('node:crypto');

function capture(value) {
  const body = JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  if (typeof body !== 'string') throw Object.assign(new Error('Execution must return a serializable result.'), { code: 'RHIZOME_EXECUTION_RESULT_REQUIRED' });
  return { result: JSON.parse(body), executionDigest: 'sha256:' + crypto.createHash('sha256').update(body).digest('hex') };
}

module.exports = { capture };
