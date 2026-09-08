const assert = require('node:assert/strict');
const { isCompatibleVersion } = require('../src/controllers/ideController');

assert.equal(isCompatibleVersion('1.0.0'), true);
assert.equal(isCompatibleVersion('1.1.0'), true);
assert.equal(isCompatibleVersion('2.0.0'), false);
assert.equal(isCompatibleVersion('invalid'), false);
assert.equal(isCompatibleVersion('0.9.0'), false);

console.log('IDE contract compatibility: PASS');
