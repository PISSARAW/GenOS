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
// Test Point 6: Local worker no_answer parsing and emission logic
const localReport = {
  outcome: 'no_answer',
  claims: [],
  noAnswerProof: { method: 'local bounded verification', evidence: ['exhaustive local check completed'] }
};
const localParsedProof = recovery.proofOfNoAnswer(localReport);
assert.ok(localParsedProof, 'Local worker no_answer proof must be recognized as valid');
assert.equal(localReport.outcome === 'no_answer' && Boolean(localParsedProof), true);

console.log('✓ Point 6 verified.');
// Test Point 7: dossierDigest properly surfaces impossibility_proof type
const { dossierDigest } = require('../src/services/agentEvidenceService');
const sampleDossiers = [{
  workerId: 'worker-1',
  role: 'specialist',
  assignedBranch: 'branch-1',
  events: [{
    eventType: 'WORKER_NO_ANSWER_PROVEN',
    evidenceReport: { outcome: 'no_answer', claims: [] },
    noAnswerProof: { method: 'finite check', evidence: ['rejected state'] }
  }]
}];
const digest = dossierDigest(sampleDossiers);
assert.equal(digest[0].reports[0].type, 'impossibility_proof', 'Report must have type impossibility_proof');
assert.equal(digest[0].reports[0].outcome, 'no_answer');
assert.ok(digest[0].reports[0].noAnswerProof);

console.log('✓ Point 7 verified.');
