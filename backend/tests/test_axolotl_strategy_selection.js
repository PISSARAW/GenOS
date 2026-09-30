'use strict';

const assert = require('node:assert/strict');
const helpers = require('../src/strategies/strategySelectorHelpers');
const profile = helpers.profileProblem('incident de topologie', { type: 'incident', structuralFailure: true });
assert.equal(profile.structuralFailure, true);
const candidate = { id: 'axolotl_regeneration', problemTypes: ['incident'], traits: ['regenerative'], costLevel: 1, latencyLevel: 1, riskLevel: 1, maturity: 'implemented' };
const score = helpers.scoreStrategy(candidate, profile);
const baseline = helpers.scoreStrategy({ ...candidate, traits: [] }, profile);
assert.ok(score > baseline, 'Structural failure should increase the regenerative strategy score.');
