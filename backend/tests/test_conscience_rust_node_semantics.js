const assert = require('node:assert/strict');
const conscience = require('../src/services/agentConscienceService');

const state = conscience.createConscienceState();
conscience.evaluateBranch(state, { errorsInLoop: 2 });
assert.equal(state.currentBudget, 99, 'one conscience evaluation consumes one budget unit');
conscience.triggerEureka(state, { now: 1, windowMs: 1000, evidence: { source: 'genos-evidence-gate', claims: [{ statement: 'parity', evidence: ['verified'] }], artifact: { type: 'dossier', content: { claims: [{ statement: 'parity', evidence: ['verified'] }] }, provenance: ['test run'] } } });
assert.equal(state.dissonanceLevel, 2.5);
const rejected = conscience.createConscienceState({ dissonanceLevel: 8 });
conscience.triggerEureka(rejected, { evidence: false, validated: true });
assert.equal(rejected.eurekaMoments, 0, 'caller assertions are not evidence');
console.log('Rust/Node conscience semantics checks passed.');
