'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'causal-loop-test-secret';
const causalLoop = require('../src/services/morphogenesis/causalLoopService');

function signedEvidence(receiptId, actionId, agentId) {
  const fields = { success: true, value: 0.95, kind: 'deterministic_verifier',
    actionId, agentId, organizationId: null, projectId: null };
  const evidenceDigest = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation')
    .evidenceDigest(fields);
  const verifierDigest = require('../src/services/verifierTrustRegistry').listVerifierDigests()[0];
  const receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({
    resultId: receiptId, evidenceDigest, verifierDigest, independent: true, status: 'verified'
  });
  return { status: 'VERIFIED', ...fields, receiptId, receipt };
}

const result = causalLoop.processActionReceipt({
  agentId: 'quality-evidence-test',
  actionReceipt: {
    actionId: 'declared-only',
    outcome: { success: true, quality: 0.99, status: 'completed' },
    expectedOutcome: { success: true, quality: 0.5 }
  },
  expressionContext: {
    problemFeatures: { problemType: 'test', complexity: 0.5 },
    morphology: { topology: 'trinity' }
  }
});

assert.equal(result.outcome.quality, null);
assert.equal(result.outcome.qualityVerified, false);
assert.equal(result.outcome.evidenceRef, null);
assert.equal(result.outcome.declaredQuality, 0.99);
assert.equal(result.rpe.eligible, false);
assert.equal(result.memoryConsolidated.reason, 'verified_outcome_required');
assert.equal(result.strategyPerformance.recorded, false);
assert.equal(result.recipePerformance.recorded, false);
assert.equal(result.morphologyExperience.recorded, false);

const qualityReceiptId = 'quality-receipt:causal-memory:1';
const verifiedResult = causalLoop.processActionReceipt({
  agentId: 'quality-evidence-memory-test',
  actionReceipt: {
    id: 'action-episode:causal-memory:1',
    actionId: 'action-episode:causal-memory:1',
    type: 'observation',
    statement: 'A verified recovery completed.',
    actionType: 'recover',
    actionInput: 'restore checkpoint',
    observationOutput: 'The workspace passed its independent checks.',
    applicability: { repository: 'genos' },
    outcome: { success: true, quality: 0.95, summary: 'The workspace passed its independent checks.' },
    expectedOutcome: { success: true, quality: 0.5 },
    qualityEvidence: signedEvidence(qualityReceiptId, 'action-episode:causal-memory:1', 'quality-evidence-memory-test')
  }
});
assert.equal(verifiedResult.outcome.qualityVerified, true);
assert.equal(verifiedResult.memoryConsolidated.action, 'semantic');
assert.deepEqual(verifiedResult.memoryConsolidated.entry.evidenceRefs, [qualityReceiptId]);
assert.deepEqual(verifiedResult.memoryConsolidated.entry.provenance.sourceRefs,
  ['action-episode:causal-memory:1', qualityReceiptId]);
assert.deepEqual(verifiedResult.memoryConsolidated.entry.applicability, { repository: 'genos' });

const replayedEvidence = causalLoop.processActionReceipt({
  agentId: 'quality-evidence-memory-test',
  actionReceipt: { actionId: 'different-action', outcome: { success: true, quality: 0.95 },
    qualityEvidence: signedEvidence(qualityReceiptId, 'action-episode:causal-memory:1', 'quality-evidence-memory-test') }
});
assert.equal(replayedEvidence.outcome.qualityVerified, false,
  'A valid quality receipt bound to another action cannot be replayed into this action.');
assert.equal(replayedEvidence.memoryConsolidated.reason, 'verified_outcome_required');

const crossScopeEvidence = causalLoop.processActionReceipt({
  agentId: 'quality-evidence-memory-test', organizationId: 'other-org', projectId: 'other-project',
  actionReceipt: { actionId: 'action-episode:causal-memory:1',
    qualityEvidence: signedEvidence(qualityReceiptId, 'action-episode:causal-memory:1', 'quality-evidence-memory-test') }
});
assert.equal(crossScopeEvidence.outcome.qualityVerified, false,
  'A global quality receipt cannot authorize learning inside an unrelated tenant scope.');

console.log('Causal learning ignores self-declared quality without a signed verifier receipt.');
