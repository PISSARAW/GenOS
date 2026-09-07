const assert = require('node:assert/strict');
const recovery = require('../src/services/workerFailureRecoveryService');
const { evidenceScore } = require('../src/services/agentEvidenceService');

console.log('--- Testing No-Answer Proof Remediation Suite ---');

// Test Point 1: Root orchestrator classification
const orchestratorNoAnswer = recovery.classifyFinalReport({
  outcome: 'no_answer',
  noAnswerProof: { method: 'finite state enumeration', evidence: ['16 states checked'] }
}, false);
assert.equal(orchestratorNoAnswer.outcome, 'no_answer', 'Orchestrator outcome must not be forced to success when no_answer is proven');
assert.ok(orchestratorNoAnswer.noAnswerProof, 'Orchestrator noAnswerProof must be preserved');

// Test Point 3: Evidence score for impossibility proof
const proofScore = evidenceScore({
  evidenceReport: {
    outcome: 'no_answer',
    noAnswerProof: { method: 'exhaustive_search', evidence: ['subgraph A falsified', 'subgraph B falsified'] }
  }
});
assert(proofScore >= 37, `Proof score must be positive and significant (got ${proofScore})`);

const emptyProofScore = evidenceScore({
  evidenceReport: {
    outcome: 'no_answer',
    noAnswerProof: { method: 'exhaustive_search', evidence: [] }
  }
});
assert.equal(emptyProofScore, 0, 'Empty proof evidence must score 0');

console.log('✓ Point 1 & Point 3 verified.');
