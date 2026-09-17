'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/inferenceService');
assert.equal(service.classifyArgument({ premises: ['A>B', 'A'], conclusion: 'B' }).valid, true);
assert.equal(service.classifyArgument({ premises: ['A>B'], conclusion: 'A' }).valid, false);
console.log('inference entailment: ok');
