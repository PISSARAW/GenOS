'use strict';

const assert = require('node:assert/strict');
const { locatorRepairHint } = require('../src/services/workerCodeTestRepairRules');

const hint = locatorRepairHint({ proposal: { tests: [{
  stderr: 'AssertionError [ERR_ASSERTION]: reject partial numeric strings\nactual: 8080\nexpected: null'
}] } });
assert.match(hint, /Preserve the existing exported API and project shape/);
assert.match(hint, /Do not rewrite a library into another application/);
console.log('Generic assertion repair guidance checks passed.');
