'use strict';

const assert = require('node:assert/strict');
const continuation = require('../src/services/endogenousThoughtContinuationService');

assert.equal(typeof continuation.continueLearnedThought, 'function');
assert.equal(typeof continuation.stopContinuation, 'function');
assert.equal(typeof continuation.normalizeInput, 'function');

const skipped = continuation.continueLearnedThought
  ? null
  : null;
void skipped;
console.log('ETT continuation smoke checks passed.');