'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/nonClassicalLogicService');
assert.equal(service.evaluate({ value: 'both', semantics: 'paraconsistent', negated: true }).value, 'both');
assert.equal(service.evaluate({ value: 'both', semantics: 'paraconsistent' }).explosion, 'blocked');
assert.equal(service.compareExcludedMiddle().valid, false);
console.log('non-classical logic: ok');
