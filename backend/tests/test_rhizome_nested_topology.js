'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const admissionService = require('../src/services/rhizome/security/capabilityAdmissionService');
const receipts = require('../src/services/epistemicVerifierReceiptService');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'rhizome-test-secret';

async function run() {
  const session = await rhizome.composeRhizome('Determine whether three competing strategies are needed.');
  const proposal = await rhizome.proposeNestedTopology(session.sessionId, {
    missionId: session.missionId,
    needKind: 'hypothesis_competition',
    budget: 1200
  });
  assert.equal(proposal.targetTopology, 'trinity');
  assert.equal(proposal.candidateNode.kind, 'SUB_TOPOLOGY');
  assert.equal(proposal.candidateNode.state, 'DISCOVERED');
  assert.equal(proposal.plan.selectedTopology, 'trinity');
  let snapshot = await rhizome.graphSnapshot(session.sessionId);
  assert.ok(snapshot.nodes.some((node) => node.nodeId === proposal.candidateNode.nodeId));
  assert.equal((await rhizome.routeToCapability(session.sessionId, {
    needId: 'nested', capability: 'topology:trinity'
  })).verdict, 'unreachable');
  const proof = { kind: 'CAPABILITY_VERIFIED', evidenceId: 'morphogenesis-evidence', verifierDigest: 'trusted-verifier',
    candidateId: 'morphogenesis-plan', nodeId: proposal.candidateNode.nodeId,
    capability: proposal.candidateNode.capabilities[0], independent: true, evidenceRefs: [] };
  proof.signedReceipt = receipts.issueReceipt({ resultId: proof.evidenceId,
    evidenceDigest: admissionService.evidenceDigest(proposal.candidateNode, proof),
    verifierDigest: proof.verifierDigest, independent: true });
  const admission = {
    nodeId: proposal.candidateNode.nodeId,
    expectedGraphVersion: snapshot.graphVersion,
    morphogenesisPlan: proposal.plan,
    proof
  };
  await assert.rejects(() => rhizome.admitNestedTopology(session.sessionId, admission, {
    admissionPolicy: { trustedProviderIds: ['morphogenesis'], trustedVerifierDigests: [] }
  }), { code: 'RHIZOME_ADMISSION_EVIDENCE_REQUIRED' });
  snapshot = await rhizome.graphSnapshot(session.sessionId);
  assert.equal(snapshot.graphVersion, admission.expectedGraphVersion);
  await rhizome.admitNestedTopology(session.sessionId, admission, {
    admissionPolicy: { trustedProviderIds: ['morphogenesis'], trustedVerifierDigests: ['trusted-verifier'] }
  });
  snapshot = await rhizome.graphSnapshot(session.sessionId);
  assert.equal(snapshot.nodes.find((node) => node.nodeId === proposal.candidateNode.nodeId).state, 'ACTIVE');
  assert.equal((await rhizome.routeToCapability(session.sessionId, {
    needId: 'nested-admitted', capability: 'topology:trinity'
  })).selected, true);
}

run().then(() => console.log('Rhizome nested topology checks: PASS')).catch((error) => {
  console.error('Rhizome nested topology test failed:', error);
  process.exit(1);
});
