'use strict';

const assert = require('node:assert/strict');
const outcomes = require('../src/services/agentProcessOutcome');

assert.equal(outcomes.shouldEmitCloseOutcome({ terminalEventSeen: true,
  termination: { kind: 'budget' }, operatorStop: null, apoptosisTerminal: false }), false,
'a child terminal event seals the outcome before the process close callback');
assert.equal(outcomes.shouldEmitCloseOutcome({ terminalEventSeen: true,
  termination: null, operatorStop: { kind: 'operator' }, apoptosisTerminal: false }), false,
'an operator close does not duplicate a terminal event already emitted by the child');
assert.equal(outcomes.shouldEmitCloseOutcome({ terminalEventSeen: false,
  termination: { kind: 'budget' }, operatorStop: null, apoptosisTerminal: false }), true);

console.log('Agent terminal outcome idempotency: PASS');
