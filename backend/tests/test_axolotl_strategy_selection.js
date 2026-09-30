'use strict';

const assert = require('node:assert/strict');
const { selectStrategyPortfolio } = require('../src/strategies/strategySelector');
const helpers = require('../src/strategies/strategySelectorHelpers');
const { scoreStrategy } = require('../src/strategies/strategySelectorEligibility');
const profile = selectStrategyPortfolio({
  problem: 'incident de topologie', problemProfile: { type: 'incident' }, failureContext: { structural: true }
}).profile;
assert.equal(profile.structuralFailure, true);
const candidate = { id: 'axolotl_regeneration', problemTypes: ['incident'], traits: ['regenerative'], costLevel: 1, latencyLevel: 1, riskLevel: 1, maturity: 'implemented' };
const score = scoreStrategy(candidate, profile);
const baseline = scoreStrategy({ ...candidate, traits: [] }, profile);
assert.ok(score > baseline, 'Structural failure should increase the regenerative strategy score.');
