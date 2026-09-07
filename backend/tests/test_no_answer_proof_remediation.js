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
// Test Point 4: Strict validation of method and trimmed evidence
const withoutMethod = recovery.proofOfNoAnswer({ noAnswerProof: { evidence: ['valid evidence'] } });
assert.equal(withoutMethod, null, 'proofOfNoAnswer without method must return null');

const blankMethod = recovery.proofOfNoAnswer({ noAnswerProof: { method: '   ', evidence: ['valid evidence'] } });
assert.equal(blankMethod, null, 'proofOfNoAnswer with whitespace method must return null');

const blankEvidence = recovery.proofOfNoAnswer({ noAnswerProof: { method: 'enumeration', evidence: ['   ', ''] } });
assert.equal(blankEvidence, null, 'proofOfNoAnswer with whitespace-only evidence must return null');

const validProof = recovery.proofOfNoAnswer({ noAnswerProof: { method: 'enumeration', evidence: ['  state 1 verified  '] } });
assert.equal(validProof.method, 'enumeration');
assert.deepEqual(validProof.evidence, ['state 1 verified']);

console.log('✓ Point 4 verified.');
// Test Point 5: Operational failures never conclude conclude_no_answer even if proof exists
const opFailureReport = recovery.failureReport({
  eventType: 'WORKER_TASK_FAILED',
  detail: 'Command timed out',
  payload: {
    failure: { category: 'transient_runtime', reason: 'timeout' },
    noAnswerProof: { method: 'enumeration', evidence: ['draft'] }
  }
}, { agentId: 'worker-op', recoveryAttempt: 0 });

const opDecision = recovery.decideRecovery(opFailureReport);
assert.notEqual(opDecision.action, 'conclude_no_answer', 'Operational failure must not conclude conclude_no_answer');

console.log('✓ Point 5 verified.');
