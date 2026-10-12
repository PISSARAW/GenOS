'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const fx = require('./helpers/rhizomeExecutionFixtures');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-private-receipt-test';

async function run() {
  const privateNode = (id) => ({ ...fx.node(id, ['answer']),
    localContext: { confidentiality: 'PRIVATE', trustDomain: 'local' } });
  const session = await rhizome.composeRhizome('Keep verified private routes private.', {
    variant: 'private', nodes: [privateNode('a'), privateNode('b')]
  });
  const need = { needId: 'answer', capability: 'answer' };
  const planned = await rhizome.routeToCapability(session.sessionId, need);
  assert.equal(planned.selected, true);
  assert.equal(planned.route.nodeIds.at(-1), 'a');
  await rhizome.recordRouteOutcome(session.sessionId, fx.makeReceipt({
    sessionId: session.sessionId, route: planned.route, need, result: { answer: 42 }
  }), { trustedVerifierDigests: [fx.DIGEST], latencyMs: 1 });
  const valid = await rhizome.missionMetrics(session.sessionId, { needs: [need],
    trustedVerifierDigests: [fx.DIGEST] });
  assert.equal(valid.canMerge, true);
  session.nodes.find((node) => node.nodeId === 'a').localContext.confidentiality = 'PUBLIC';
  const alternative = await rhizome.routeToCapability(session.sessionId, need);
  assert.equal(alternative.selected, true);
  assert.equal(alternative.route.nodeIds.at(-1), 'b');
  const stale = await rhizome.missionMetrics(session.sessionId, { needs: [need],
    trustedVerifierDigests: [fx.DIGEST] });
  assert.equal(stale.canMerge, false);
  assert.deepEqual(stale.unresolvedNeedIds, ['answer']);
  console.log('Rhizome private receipts require the current permitted route: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
