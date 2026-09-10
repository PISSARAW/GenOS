const assert = require('node:assert/strict');
const { evidenceScore } = require('../src/services/agentEvidenceService');

assert.equal(evidenceScore({}), null, 'Empty payload must not fabricate a zero score');
assert.equal(evidenceScore({ evidenceReport: {} }), null, 'Empty evidence report must not fabricate a zero score');
assert.equal(evidenceScore({ evidenceReport: { claims: [] } }), null, 'No claims and no other signal must yield null');
assert.equal(evidenceScore({ eventType: 'AGENT_FAILED' }), 0, 'Explicit failure event must still score 0');
assert.equal(evidenceScore({ evidenceReport: { outcome: 'failed' } }), 0, 'Failed outcome must still score 0');
assert.equal(evidenceScore({ failure: { reason: 'crash' } }), 0, 'Payload failure must still score 0');
assert(evidenceScore({ evidenceReport: { claims: [{ evidence: ['log line'] }] } }) > 0, 'Claims with evidence keep a numeric score');
assert(evidenceScore({ evidenceReport: { outcome: 'no_answer', noAnswerProof: { evidence: ['state A checked', 'state B checked'] } } }) >= 37, 'No-answer proof keeps a numeric score');
console.log('Agent evidence scoring contract checks passed.');
