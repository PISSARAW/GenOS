'use strict';

const assert = require('node:assert/strict');
const homeostasis = require('../src/services/rhizome/runtime/homeostasisController');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');
const routeReceipts = require('../src/services/rhizome/learning/routeReceiptService');
const verifierReceipts = require('../src/services/epistemicVerifierReceiptService');

function run() {
  const controller = homeostasis.create();
  const failed = controller.observe({ status: 'ROUTE_FAILED_NO_ALTERNATIVE' });
  assert.equal(failed.pressure, 2);
  assert.equal(failed.recommendedVariant, 'resilient');
  const gap = controller.observe({ status: 'GAP_OPEN' }, { budgetTight: true });
  assert.equal(gap.recommendedVariant, 'resilient');
  const stable = homeostasis.create();
  assert.equal(stable.observe({ status: 'ROUTE_SUCCESS' }).stableTicks, 1);
  assert.equal(stable.observe({ status: 'ROUTE_RECOVERED' }).stableTicks, 2);
  assert.equal(stable.observe({ status: 'GAP_OPEN' }).stableTicks, 0);
}

async function verifyRuntimeVariantSwitch() {
  const need = { needId: 'gap', capability: 'missing' };
  const dynamic = await rhizome.composeRhizome('Switch after capability uncertainty.', { variant: 'routing' });
  await runtime.run({ sessionId: dynamic.sessionId, needs: [need], maxTicks: 1 });
  assert.equal(dynamic.variant, 'exploratory');
  const fixed = await rhizome.composeRhizome('Keep a fixed route profile.', { variant: 'routing' });
  await runtime.run({ sessionId: fixed.sessionId, needs: [need], maxTicks: 1, dynamicVariants: false });
  assert.equal(fixed.variant, 'routing');
}

async function verifyStableStop() {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-stable-test-secret';
  const session = await rhizome.composeRhizome('Stop after stable verified routes.', {
    nodes: [node('source', []), node('target', ['answer'])],
    edges: [edge('route', 'source', 'target')]
  });
  const result = await runtime.run({
    sessionId: session.sessionId,
    trustedVerifierDigests: ['trusted-stable-verifier'],
    needs: [{ needId: 'one', capability: 'answer' }, { needId: 'two', capability: 'answer' }, { needId: 'three', capability: 'answer' }],
    execute: async ({ route }) => ({ routeId: route.routeId }),
    verify: async ({ route, need }) => makeReceipt(route, need)
  });
  assert.equal(result.stopReason, 'STABLE_TICKS');
  assert.equal(result.results.length, 2);
}

function node(nodeId, capabilities) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9, evidenceRequirements: [] };
}

function edge(edgeId, from, to) {
  return { edgeId, from, to, relation: 'ROUTES_TO', status: 'ACTIVE', compatibility: 0.9, conductivity: 0.9, reliability: 0.9, successRate: 0.9, evidenceQuality: 0.9, cost: 0, latency: 1, trailState: { positive: 0, negative: 0 } };
}

function makeReceipt(route, need) {
  const value = {
    routeId: route.routeId, needId: need.needId, capability: need.capability,
    nodeIds: route.nodeIds, edgeIds: route.edgeIds, outcome: 'SUCCESS',
    verification: { verificationId: `verify-${need.needId}`, verifierId: 'stable-verifier', result: 'SUCCESS', status: 'VERIFIED', evidenceRefs: [`evidence:${need.needId}`] }
  };
  value.verification.signedReceipt = verifierReceipts.issueReceipt({
    resultId: value.routeId, evidenceDigest: routeReceipts.outcomeDigest(value),
    verifierDigest: 'trusted-stable-verifier', status: 'verified', independent: true
  });
  return value;
}

run();
Promise.all([verifyRuntimeVariantSwitch(), verifyStableStop()]).then(() => console.log('Rhizome homeostasis and variants: PASS')).catch((error) => {
  console.error('Rhizome homeostasis runtime failed:', error);
  process.exit(1);
});
