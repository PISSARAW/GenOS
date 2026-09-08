const assert = require('node:assert/strict');
const { jobMaxAttempts, jobTimeoutMs, jsonByteLength } = require('../src/controllers/argumentBounds');

assert.equal(jobMaxAttempts(-1), 3);
assert.equal(jobMaxAttempts(4.5), 3);
assert.equal(jobMaxAttempts(20), 3);
assert.equal(jobMaxAttempts(4), 4);
assert.equal(jobTimeoutMs(-1), 30000);
assert.equal(jobTimeoutMs(30 * 60 * 1000 + 1), 30000);
assert.equal(jobTimeoutMs(5000), 5000);
assert.ok(jsonByteLength({ text: 'é' }) > 10);
console.log('Job argument bounds checks passed.');