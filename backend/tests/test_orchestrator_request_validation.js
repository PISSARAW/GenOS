'use strict';
const assert = require('node:assert/strict');
const { validatePayload, validateRequest } = require('../bin/orchestratorRequestValidation.cjs');
for (const value of [null, [], 'orchestrate', 1]) assert.throws(() => validatePayload(value));
assert.throws(() => validatePayload({}), /action, mission, task, or strategy/);
for (const value of ['', 0, false]) assert.throws(() => validatePayload({ mission: value }), /mission/);
for (const request of [{ mission: 'ship it' }, { task: 'ship it' }, { action: 'organization_state' },
  { strategy: 'biome' }]) validatePayload(request);
for (const action of ['orchestrate', 'dispatch_worker', 'philosophy']) validateRequest(action, {});
assert.throws(() => validateRequest('typo', {}), /Unknown/);
for (const policy of [null, undefined, []]) assert.throws(() => validateRequest('orchestrate', policy), /policy/);
for (const timeoutMs of [0, -1, NaN, Infinity, 'invalid', '5000', true]) {
  assert.throws(() => validateRequest('orchestrate', { timeoutMs }));
}
validateRequest('orchestrate', { timeoutMs: 5000 });
console.log('Malformed orchestration requests are rejected before mission persistence.');
