'use strict';
const assert = require('assert');
const { scoreStrategy, explainScore } = require('../src/strategies/strategySelectorEligibility');

const profile = { type: 'incident', risk: 'high' };
function strategy(id, traits) {
  return { id, problemTypes: ['incident'], traits, costLevel: 1, latencyLevel: 1, riskLevel: 1, maturity: 'implemented' };
}

const relevant = scoreStrategy(strategy('a', ['safety', 'verification']), profile);
const neutral = scoreStrategy(strategy('b', ['low_cost']), profile);
assert.ok(relevant > neutral, 'pertinent trait must outrank unrelated trait');

const twice = scoreStrategy(strategy('a', ['safety', 'verification']), profile);
assert.equal(relevant, twice, 'scoring must be deterministic');

const explained = explainScore(strategy('a', ['safety']), profile);
assert.equal(explained.base, 48);
assert.equal(explained.compatibilityBonus, 8);
assert.deepEqual(explained.applied, [{ trait: 'safety', profile: 'incident', weight: 8 }]);
assert.ok(typeof explained.costPenalty === 'number');
assert.ok(typeof explained.total === 'number');

const unknown = explainScore(strategy('u', ['trait_inconnu_xyz']), profile);
assert.deepEqual(unknown.unknownTraits, ['trait_inconnu_xyz']);
assert.equal(unknown.compatibilityBonus, 0);

console.log('Strategy trait scoring checks passed.');
