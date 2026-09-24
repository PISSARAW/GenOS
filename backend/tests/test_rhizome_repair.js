'use strict';

const assert = require('node:assert/strict');
const repairService = require('../src/services/rhizome/resilience/routeRepairService');
const analytics = require('../src/services/rhizome/analytics/graphAnalyticsService');
const receiptService = require('../src/services/rhizome/learning/routeReceiptService');
const verifierReceipts = require('../src/services/epistemicVerifierReceiptService');

function node(nodeId, capabilities) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9, cost: 0, latency: 0, evidenceRequirements: [], availability: { status: 'AVAILABLE' } };
}

function edge(edgeId, from, to) {
  return { edgeId, from, to, relation: 'ROUTES_TO', status: 'ACTIVE', compatibility: 0.9, conductivity: 0.8, reliability: 0.9, successRate: 0.8, evidenceQuality: 0.8, cost: 0, latency: 1, trailState: { positive: 0, negative: 0, verifiedFlow: 0 } };
}

function routeFailureReceipt() {
  const receipt = {
    routeId: 'route:n1:ab/bd', needId: 'n1', capability: 'answer',
    nodeIds: ['a', 'b', 'd'], edgeIds: ['ab', 'bd'], outcome: 'FAILURE',
    verification: { verificationId: 'verify-failure', verifierId: 'independent', result: 'FAILURE', status: 'VERIFIED', evidenceRefs: ['failure:report'] }
  };
  receipt.verification.signedReceipt = verifierReceipts.issueReceipt({
    resultId: receipt.routeId, evidenceDigest: receiptService.outcomeDigest(receipt),
    verifierDigest: 'trusted-route-verifier', status: 'verified', independent: true
  });
  return receipt;
}

function run() {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-repair-test-secret';
  const graph = {
    graphVersion: 1,
    nodes: [node('a', ['search']), node('b', ['translate']), node('c', ['translate']), node('d', ['answer'])],
    edges: [edge('ab', 'a', 'b'), edge('bd', 'b', 'd'), edge('ac', 'a', 'c'), edge('cd', 'c', 'd')],
    coordinationLoci: [{ holderNodeId: 'a' }]
  };
  const repaired = repairService.repair({
    session: graph, need: { needId: 'n1', capability: 'answer' }, receipt: routeFailureReceipt(),
    trustedVerifierDigests: ['trusted-route-verifier']
  });
  assert.equal(repaired.repaired, true);
  assert.deepEqual(repaired.excludedEdgeIds, ['ab', 'bd']);
  assert.deepEqual(repaired.route.edgeIds, ['ac', 'cd']);
  assert.equal(graph.edges[0].status, 'ACTIVE');

  const chain = { nodes: [node('x', []), node('y', []), node('z', [])], edges: [edge('xy', 'x', 'y'), edge('yz', 'y', 'z')] };
  const health = analytics.assess(chain);
  assert.equal(health.componentCount, 1);
  assert.deepEqual(health.bridgeEdgeIds, ['xy', 'yz']);
  assert.deepEqual(health.articulationNodeIds, ['y']);
}

run();
console.log('Rhizome repair and analytics tests passed.');
