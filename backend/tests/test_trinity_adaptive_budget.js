'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'trinity-adaptive-budget-test-secret';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { allocate } = require('../src/services/trinityAdaptiveBudgetService');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const verifiers = require('../src/services/verifierTrustRegistry');

function result(agentId, uncertainty) {
  const evidenceId = `uncertainty-${agentId}`;
  return {
    agentId,
    status: 'completed',
    payload: {
      evidenceReport: {
        evidenceVector: { uncertainty },
        evidenceVectorEvidence: { uncertainty: [evidenceId] },
        evidence: [{ id: evidenceId, verificationReceipt: receipts.issueReceipt({
          resultId: `uncertainty-${agentId}`, status: 'verified', independent: true,
          evidenceDigest: `sha256:${crypto.createHash('sha256').update(agentId).digest('hex')}`,
          verifierDigest: verifiers.getVerifier('testResult').digest,
          independenceDescriptor: { actorId: `verifier-${agentId}`, workspaceId: `workspace-${agentId}` }
        }) }]
      }
    }
  };
}

const workerIds = ['world-1', 'world-2', 'world-3'];
const input = {
  workerIds,
  results: workerIds.map((id, index) => result(id, [0.2, 0.5, 0.8][index])),
  pool: 300,
  minimumTokens: 10
};
const allocation = allocate(input);
assert.equal(allocation.basis, 'verified_evidence_vector_uncertainty');
assert.equal(allocation.worlds.reduce((sum, world) => sum + world.tokens, 0), 300);
assert.ok(allocation.worlds.every((world) => world.tokens >= 10));
assert.ok(allocation.worlds[2].tokens > allocation.worlds[0].tokens);

assert.equal(allocate({ poolTokens: 300, worldUncertainties: [0.2, 0.5, 0.8] }), null);
assert.equal(allocate({ ...input, workerIds: ['world-1', 'world-1', 'world-3'] }), null);
assert.equal(allocate({ ...input, pool: 29 }), null);
assert.equal(allocate({ ...input, results: [result('world-1', null), ...input.results.slice(1)] }), null);
assert.equal(allocate({ ...input, results: input.results.map((entry, index) => index === 1
  ? { ...entry, status: 'failed' } : entry) }), null);
assert.equal(allocate({ ...input, results: input.results.map((entry, index) => index === 2
  ? { ...entry, payload: { evidenceReport: { evidenceVector: { uncertainty: 0.8 } } } } : entry) }), null);

console.log('Trinity adaptive budget: PASS');
