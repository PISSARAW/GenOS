const assert = require('node:assert/strict');
const conscience = require('../src/services/agentConscienceService');

const state = conscience.createConscienceState();
conscience.evaluateBranch(state, { errorsInLoop: 2 });
assert.equal(state.currentBudget, 99, 'one conscience evaluation consumes one budget unit');
assert.equal(state.revision, 1);
conscience.triggerEureka(state, { now: 1, windowMs: 1000 });
assert.equal(state.revision, 2);
assert.equal(state.dissonanceLevel, 2.5);
console.log('Rust/Node conscience semantics checks passed.');
