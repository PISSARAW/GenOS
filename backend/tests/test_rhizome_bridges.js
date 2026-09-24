'use strict';

const assert = require('node:assert/strict');
const bridgeService = require('../src/services/rhizome/bridges/bridgeService');
const validation = require('../src/services/rhizome/bridges/bridgeValidationService');
const routePlanner = require('../src/services/rhizome/routing/routePlanner');
const { normalizeBridge } = require('../src/services/rhizome/contracts/bridgeContract');
const verifierReceipts = require('../src/services/epistemicVerifierReceiptService');

function session() {
  const node = (nodeId, capabilities) => ({
    nodeId, kind: 'TOOL', capabilities, state: 'ACTIVE', reliability: 0.95,
    availability: { status: 'AVAILABLE' }, evidenceRequirements: [], cost: 0, latency: 0
  });
  return {
    graphVersion: 0,
    nodes: [node('source', ['legacy_payload']), node('target', ['typed_payload'])],
    edges: [],
    coordinationLoci: [{ holderNodeId: 'source' }]
  };
}

function bridge() {
  return normalizeBridge({
    bridgeId: 'schema-v1-v2', type: 'SCHEMA_ADAPTER', fromNodeId: 'source', toNodeId: 'target',
    sourceCapability: 'legacy_payload', targetCapability: 'typed_payload',
    inputContract: 'legacy-v1', outputContract: 'typed-v2', invariants: ['identity-preserved']
  });
}

function proofFor(contract) {
  const proof = {
    inputAccepted: true, outputValid: true, invariantsPreserved: true, evidencePreserved: true,
    evidenceRefs: ['adapter-tests:passing']
  };
  proof.signedReceipt = verifierReceipts.issueReceipt({
    resultId: contract.bridgeId, evidenceDigest: validation.proofDigest(contract, proof),
    verifierDigest: 'trusted-bridge-verifier', independent: true, status: 'verified'
  });
  return proof;
}

function run() {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-bridge-test-secret';
  const source = session();
  const contract = bridge();
  const integrated = bridgeService.integrate({
    session: source, bridge: contract, proof: proofFor(contract), trustedVerifierDigests: ['trusted-bridge-verifier']
  });
  assert.equal(integrated.nodes.some((item) => item.nodeId === 'bridge:schema-v1-v2' && item.state === 'ACTIVE'), true);
  assert.equal(integrated.edges.length, 2);
  const route = routePlanner.plan(integrated, { needId: 'n', capability: 'typed_payload' });
  assert.deepEqual(route.route.nodeIds, ['source', 'bridge:schema-v1-v2', 'target']);

  const rejectedSession = session();
  const invalidProof = proofFor(contract);
  invalidProof.evidencePreserved = false;
  assert.throws(() => bridgeService.integrate({
    session: rejectedSession, bridge: contract, proof: invalidProof, trustedVerifierDigests: ['trusted-bridge-verifier']
  }), { code: 'RHIZOME_BRIDGE_REJECTED' });
  assert.equal(rejectedSession.nodes.length, 2);
}

run();
console.log('Rhizome bridge tests passed.');
