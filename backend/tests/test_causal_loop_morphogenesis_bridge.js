'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'causal-loop-execution-bridge-test-only';

const assert = require('node:assert/strict');
const bridge = require('../src/services/causalLoopExecutionBridge');
const evidenceValidation = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation');

function signedEvidence(actionId, agentId, receiptId) {
  const fields = { success: true, value: 0.91, kind: 'deterministic_verifier', actionId, agentId,
    organizationId: 'causal-org', projectId: 'causal-project' };
  const verifierDigest = require('../src/services/verifierTrustRegistry').listVerifierDigests()[0];
  const receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({
    resultId: receiptId, evidenceDigest: evidenceValidation.evidenceDigest(fields), verifierDigest,
    independent: true, status: 'verified'
  });
  return { status: 'VERIFIED', ...fields, receiptId, receipt };
}

const run = { id: 'causal-run-bridge-1', agent_id: 'causal-agent-bridge-1', status: 'completed' };
const event = { eventType: 'AGENT_COMPLETED', payload: {
  qualityEvidence: signedEvidence(run.id, run.agent_id, 'causal-quality-bridge-1')
} };
const biologicalReceipt = { result: { verified: true }, budgetAssessment: { satisfied: true },
  semanticVerification: { schema: 'genos.native-oracle-receipt-reference/v1' } };
const db = { get: async () => ({ organizationId: 'causal-org', projectId: 'causal-project' }) };

async function main() {
  const accepted = await bridge.observe(db, { run, biologicalReceipt, event });
  assert.equal(accepted.status, 'observed');
  assert.equal(accepted.receipt.actionId, run.id);
  assert.equal(accepted.receipt.outcome.qualityVerified, true);
  assert.equal(accepted.receipt.outcome.evidenceRef, 'causal-quality-bridge-1');

  const unverified = await bridge.observe(db, { run, biologicalReceipt: { ...biologicalReceipt,
    result: { verified: false } }, event });
  assert.equal(unverified.status, 'refused');

  const replay = { ...event, payload: { qualityEvidence: signedEvidence('different-run', run.agent_id,
    'causal-quality-bridge-2') } };
  const mismatched = await bridge.observe(db, { run, biologicalReceipt, event: replay });
  assert.equal(mismatched.status, 'refused');
  assert.equal(mismatched.reason, 'signed_quality_evidence_binding_required');

  const partialScope = { get: async () => ({ organizationId: 'causal-org', projectId: null }) };
  const refusedScope = await bridge.observe(partialScope, { run, biologicalReceipt, event });
  assert.equal(refusedScope.reason, 'agent_scope_unavailable');
}

main().then(() => console.log('Verified worker receipts enter causal learning only with action-bound signed quality evidence.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
