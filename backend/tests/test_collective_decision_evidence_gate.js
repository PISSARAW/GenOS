const assert = require('node:assert/strict');
const { hasDecisionEvidence, decisionEvidenceFailure } = require('../src/services/agentEvidenceService');
const { proofOfNoAnswer } = require('../src/services/workerFailureRecoveryService');

assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { advice: 'done' } }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { evidenceReport: { claims: [{ statement: 'verified', evidence: ['test passed'] }] } } }), true);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { claims: [{ evidence: [{ status: 'ok' }] }] } }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: {} }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: { status: 'failed' } }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: { failure: { status: 'failed' } } }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: { executionRunId: 'run-1' } }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: { workerId: 'worker-1' } }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: { stderr: 'TypeError: invalid state' } }), true);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: { failure: { reason: 'boom' } } }), true);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { claims: [{ evidence: [{ status: 'ok', artifactRef: 'receipt-42' }] }] } }), true);
assert.equal(hasDecisionEvidence({ eventType: 'EVIDENCE_REPORT', payload: {
  outcome: 'success', claims: [{ evidence: ['test.log'] }], failure: { reason: 'test failed elsewhere' }
} }), false);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: {
  outcome: 'success', claims: [{ evidence: ['test.log'] }]
} }), false);
assert.match(decisionEvidenceFailure({ eventType: 'AGENT_COMPLETED' }), /no substantiated evidence/);
const validNoAnswer = { outcome: 'no_answer', noAnswerProof: {
  method: 'bounded enumeration', evidence: ['all 16 states checked']
} };
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { evidenceReport: validNoAnswer } }), true);
assert.deepEqual(proofOfNoAnswer(validNoAnswer), validNoAnswer.noAnswerProof);
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: {
  noAnswerProof: { method: '', evidence: ['draft'] }
} }), false, 'No-answer proof without a method must not open the collective gate.');
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: {
  noAnswerProof: { method: 'bounded enumeration', evidence: ['draft'] }
} }), false, 'A proof outside an explicit no_answer outcome must not open the gate.');
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: {
  noAnswerProof: { method: '', evidence: ['draft'] }
} }), false, 'Malformed no-answer proof alone is not failure evidence.');
assert.equal(hasDecisionEvidence({ eventType: 'AGENT_FAILED', payload: {
  noAnswerProof: { method: '', evidence: ['draft'] }, failure: { reason: 'runtime failed' }
} }), true, 'Independent failure evidence remains admissible.');
console.log('Collective decisions require agent evidence.');
