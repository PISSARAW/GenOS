'use strict';

const assert = require('node:assert/strict');
const { PROTOCOL, assertProtocol } = require('./protocol.cjs');

assert.equal(assertProtocol(), PROTOCOL);
assert.equal(PROTOCOL.primaryScenario.agents, 10);
assert.equal(PROTOCOL.primaryScenario.tasks, 100);
assert.throws(() => assertProtocol({ ...PROTOCOL, controls: {} }));
console.log('communication-economy protocol: ok');
