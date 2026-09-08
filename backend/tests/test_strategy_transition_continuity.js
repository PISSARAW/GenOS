const assert = require('node:assert/strict');
const { validateStrategyTransitionContinuity } = require('../src/services/strategyCoherenceValidator');

const previous = { problem_profile: { type: 'incident' }, strategy_portfolio: [{ id: 'a' }, { id: 'b' }] };
const removed = { problem_profile: { type: 'incident' }, strategy_portfolio: [{ id: 'a' }] };
const changedProfile = { problem_profile: { type: 'security' }, strategy_portfolio: [{ id: 'a' }, { id: 'b' }] };
assert.equal(validateStrategyTransitionContinuity(previous, removed).coherent, false);
assert.equal(validateStrategyTransitionContinuity(previous, changedProfile).coherent, false);
assert.equal(validateStrategyTransitionContinuity(previous, previous).coherent, true);
console.log('Strategy transition continuity checks passed.');
