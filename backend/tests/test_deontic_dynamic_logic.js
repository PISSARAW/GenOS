'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/deonticDynamicLogicService');
assert.equal(service.assessDuty({ obligations: ['backup'], action: 'backup' }).obligation, true);
assert.equal(service.assessDuty({ obligations: ['x'], prohibitions: ['x'], action: 'x' }).conflict, true);
assert.deepEqual(service.publicAnnouncement({ model: { worlds: ['a', 'b'], valuation: { a: { p: true }, b: { p: false } } }, announcement: 'p' }).model.worlds, ['a']);
console.log('deontic/dynamic logic: ok');
