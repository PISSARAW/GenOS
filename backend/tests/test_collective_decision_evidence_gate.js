const assert = require('node:assert/strict');
const { hasDecisionEvidence, decisionEvidenceFailure } = require('../src/services/agentEvidenceService');

assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { advice: 'done' } }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { evidenceReport: { claims: [{ statement: 'verified', evidence: ['test passed'] }] } } }), true);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: {} }), true);
assert.match(decisionEvidenceFailure({ eventType: 'AGENT_COMPLETED' }), /no substantiated evidence/);
console.log('Collective decisions require agent evidence.');