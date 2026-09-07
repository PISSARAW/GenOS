const assert = require('node:assert/strict');
const { isRetryableJobError } = require('../src/services/jobWorker');

for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'ERR_HTTP2_STREAM_CLOSED', 'ECONNRESET']) {
  assert.equal(isRetryableJobError({ code }), true, `${code} should be retryable`);
}
assert.equal(isRetryableJobError({ code: 'INVALID_ARGUMENT', message: 'bad request' }), false);
console.log('Job retry classification checks passed.');