'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');
const routeReceipts = require('../src/services/rhizome/learning/routeReceiptService');
const verifierReceipts = require('../src/services/epistemicVerifierReceiptService');

function graph() {
  const nodes = [
    makeNode('source', ['search']), makeNode('via-fast', ['translate']),
    makeNode('via-safe', ['translate']), makeNode('target', ['answer'])
  ];
  const edges = [
    makeEdge('fast-a', { from: 'source', to: 'via-fast' }, 1), makeEdge('fast-b', { from: 'via-fast', to: 'target' }, 1),
    makeEdge('safe-a', { from: 'source', to: 'via-safe' }, 0.7), makeEdge('safe-b', { from: 'via-safe', to: 'target' }, 0.7)
  ];
  return { nodes, edges };
}

function makeNode(nodeId, capabilities) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9, evidenceRequirements: [] };
}

function makeEdge(edgeId, route, conductivity) {
  return { edgeId, ...route, relation: 'ROUTES_TO', status: 'ACTIVE', compatibility: 0.9, conductivity, reliability: 0.9, successRate: 0.9, evidenceQuality: 0.9, cost: 0, latency: 1, trailState: { positive: 0, negative: 0 } };
}

function receipt(route, need, outcome) {
  const value = {
    routeId: route.route.routeId, needId: need.needId, capability: need.capability,
    nodeIds: route.route.nodeIds, edgeIds: route.route.edgeIds, outcome,
    verification: { verificationId: `verify-${outcome}`, verifierId: 'independent', result: outcome, status: 'VERIFIED', evidenceRefs: [`evidence:${outcome}`] }
  };
  value.verification.signedReceipt = verifierReceipts.issueReceipt({
    resultId: value.routeId, evidenceDigest: routeReceipts.outcomeDigest(value),
    verifierDigest: 'trusted-recovery-verifier', status: 'verified', independent: true
  });
  return value;
}

async function run() {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-recovery-test-secret';
  const session = await rhizome.composeRhizome('Recover a failed route.', graph());
  const need = { needId: 'recover-answer', capability: 'answer' };
  let attempts = 0;
  const result = await runtime.tick({
    sessionId: session.sessionId, need, trustedVerifierDigests: ['trusted-recovery-verifier'],
    execute: async ({ route }) => ({ routeId: route.routeId }),
    verify: async ({ route }) => receipt({ route }, need, attempts++ === 0 ? 'FAILURE' : 'SUCCESS')
  });
  assert.equal(result.status, 'ROUTE_RECOVERED');
  assert.equal(attempts, 2);
  assert.deepEqual(result.repair.excludedEdgeIds, ['fast-a', 'fast-b']);
  assert.deepEqual(result.retry.receipt.edgeIds, ['safe-a', 'safe-b']);
}

run().then(() => console.log('Rhizome runtime recovery: PASS')).catch((error) => {
  console.error('Rhizome runtime recovery failed:', error);
  process.exit(1);
});
