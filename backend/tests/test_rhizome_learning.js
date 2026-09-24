'use strict';

const assert = require('node:assert/strict');
const outcomes = require('../src/services/rhizome/learning/routeOutcomeService');
const receiptService = require('../src/services/rhizome/learning/routeReceiptService');
const verifierReceipts = require('../src/services/epistemicVerifierReceiptService');

function session() {
  return {
    graphVersion: 1,
    nodes: [{ nodeId: 'target', capabilities: ['verify'] }],
    edges: [
      { edgeId: 'first', from: 'source', to: 'middle', status: 'ACTIVE', trailState: { positive: 0, negative: 0 } },
      { edgeId: 'second', from: 'middle', to: 'target', status: 'ACTIVE', trailState: { positive: 0, negative: 0 } }
    ]
  };
}

function receipt(outcome = 'SUCCESS') {
  const value = {
    routeId: 'route:n1:first/second', needId: 'n1', capability: 'verify',
    nodeIds: ['source', 'middle', 'target'], edgeIds: ['first', 'second'], outcome,
    verification: {
      verificationId: 'verification-1', verifierId: 'independent-verifier', status: 'VERIFIED', result: outcome,
      evidenceRefs: ['test-report:1']
    }
  };
  value.verification.signedReceipt = verifierReceipts.issueReceipt({
    resultId: value.routeId,
    evidenceDigest: receiptService.outcomeDigest(value),
    verifierDigest: 'trusted-verifier-digest',
    independent: true,
    status: 'verified'
  });
  return value;
}

function run() {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-learning-test-secret';
  const successful = session();
  const result = outcomes.applyOutcome({ session: successful, receipt: receipt(), trustedVerifierDigests: ['trusted-verifier-digest'], now: 1000, amount: 10, gamma: 0.8 });
  assert.deepEqual(result.credits.map((item) => item.credit), [0.8, 1]);
  assert.equal(successful.edges[0].trailState.positive, 8);
  assert.equal(successful.edges[0].trailState.verifiedFlow, 8);
  assert.equal(successful.edges[1].trailState.positive, 10);
  assert.equal(successful.graphVersion, 2);

  const failed = session();
  outcomes.applyOutcome({ session: failed, receipt: receipt('FAILURE'), trustedVerifierDigests: ['trusted-verifier-digest'], now: 2000, amount: 10 });
  assert.equal(failed.edges[0].trailState.negative, 8);
  assert.equal(failed.edges[0].trailState.positive, 0);

  const unverified = receipt();
  unverified.verification.status = 'UNVERIFIED';
  const untouched = session();
  assert.throws(() => outcomes.applyOutcome({ session: untouched, receipt: unverified, trustedVerifierDigests: ['trusted-verifier-digest'] }), { code: 'RHIZOME_ROUTE_EVIDENCE_REQUIRED' });
  assert.equal(untouched.graphVersion, 1);
  assert.throws(() => outcomes.applyOutcome({ session: session(), receipt: { ...receipt(), edgeIds: ['unknown'] }, trustedVerifierDigests: ['trusted-verifier-digest'] }), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
}

run();
console.log('Rhizome path learning tests passed.');
