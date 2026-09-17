'use strict';

const assert = require('node:assert/strict');
const causality = require('../src/services/causalityService');

const result = causality.simulateCounterfactual({
  causeAgent: 'agent-a',
  effectAgent: 'agent-b',
  scenario: 'without-tool-call'
});

assert.equal(result.verdict, 'necessary');
assert.equal(result.causalEffect, 'prevented_block');
assert.equal(result.counterfactualOutcome, 'blocked');

console.log('Causality counterfactual contract: PASS');
