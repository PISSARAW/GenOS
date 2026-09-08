const assert = require('node:assert/strict');
const { testResultPassed } = require('../src/services/arenaTaskEvaluation');

assert.equal(testResultPassed({ exitCode: 0 }), true);
assert.equal(testResultPassed({ exit_code: 0 }), true);
assert.equal(testResultPassed({ exit_code: '0' }), true);
assert.equal(testResultPassed({ exit_code: 1 }), false);
console.log('Structured evaluation result normalization is stable.');