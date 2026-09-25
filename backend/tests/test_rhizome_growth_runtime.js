'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtimeFactory = require('../src/services/rhizome/runtime/rhizomeRuntime');
const admission = require('../src/services/rhizome/security/capabilityAdmissionService');
const receipts = require('../src/services/epistemicVerifierReceiptService');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'rhizome-test-secret';

const PROVIDER_ID = 'formal-proof-worker';
const VERIFIER_DIGEST = 'formal-proof-verifier-v1';

function candidate(need, graphVersion) {
  return {
    candidateId: 'spawn-formal-proof', action: 'SPAWN_WORKER', targetNodeIds: [],
    expectedUtility: 1, creationCost: 0.1, coordinationCost: 0.1,
    duplicationRisk: 0, sufficient: true,
    evidenceRefs: [`gap-evidence:${need.needId}:${graphVersion}`]
  };
}

function runtime(withVerifier) {
  const verifiers = withVerifier ? [{
    verifierId: 'formal-proof-reviewer', verifierDigest: VERIFIER_DIGEST,
    capabilities: ['formal_proof'],
    verifyCapability: async ({ candidate: selected, node, need }) => signedProof(selected, node, need)
  }] : [];
  return runtimeFactory.create({
    providers: [{
      providerId: PROVIDER_ID, kind: 'agent', reference: 'formal-proof-worker',
      capabilities: ['formal_proof'], growthActions: ['SPAWN_WORKER'],
      instantiate: async () => ({
        node: { nodeId: 'formal-proof-node', kind: 'AGENT', capabilities: ['formal_proof'] },
        edges: []
      })
    }],
    verifiers,
    trustedProviderIds: [PROVIDER_ID],
    trustedVerifierDigests: withVerifier ? [VERIFIER_DIGEST] : []
  });
}

function signedProof(candidate, node, need) {
  const proof = { kind: 'CAPABILITY_VERIFIED', evidenceId: 'proof-check-1', verifierDigest: VERIFIER_DIGEST,
    independent: true, evidenceRefs: [], verifiedAt: '2026-09-24T00:00:00.000Z',
    candidateId: candidate.candidateId, nodeId: node.nodeId, capability: need.capability };
  proof.signedReceipt = receipts.issueReceipt({ resultId: proof.evidenceId,
    evidenceDigest: admission.evidenceDigest(node, proof), verifierDigest: VERIFIER_DIGEST, independent: true });
  return proof;
}

async function verifyVerifiedGrowth() {
  const session = await rhizome.composeRhizome('Grow only a verified formal proof provider.', { budgets: { growth: 2 } });
  const need = { needId: 'proof-need', capability: 'formal_proof' };
  const result = await runtime(true).tick({ sessionId: session.sessionId, need, candidates: [candidate(need, session.graphVersion)] });
  assert.equal(result.status, 'GROWTH_ADMITTED_ROUTE_READY');
  assert.equal(result.execution.admission.node.state, 'ACTIVE');
  assert.equal(result.execution.route.selected, true, 'the admitted provider is routed in the same tick');
  assert.equal((await rhizome.graphSnapshot(session.sessionId)).nodes[0].state, 'ACTIVE');
}

async function verifyVerifierGate() {
  const session = await rhizome.composeRhizome('Do not activate an unverified provider.', { budgets: { growth: 2 } });
  const need = { needId: 'unverified-need', capability: 'formal_proof' };
  const result = await runtime(false).tick({ sessionId: session.sessionId, need, candidates: [candidate(need, session.graphVersion)] });
  assert.equal(result.status, 'GROWTH_WAITING_FOR_VERIFIER');
  assert.equal((await rhizome.graphSnapshot(session.sessionId)).nodes.length, 0);
}

async function run() {
  await verifyVerifiedGrowth();
  await verifyVerifierGate();
}

run().then(() => console.log('Rhizome verified growth runtime: PASS')).catch((error) => {
  console.error('Rhizome growth runtime test failed:', error);
  process.exit(1);
});
