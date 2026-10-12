'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const fx = require('./helpers/rhizomeExecutionFixtures');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-session-binding-test';

async function run() {
  const options = { variant: 'persistent', nodes: [fx.node('tool', ['answer'])] };
  const source = await rhizome.composeRhizome('Answer within source mission.', options);
  const target = await rhizome.composeRhizome('Answer within target mission.', options);
  const need = { needId: 'answer', capability: 'answer' };
  const route = await rhizome.routeToCapability(source.sessionId, need);
  const receipt = fx.makeReceipt({ sessionId: source.sessionId, route: route.route, need, result: { answer: 42 } });
  const targetVersion = target.graphVersion;
  await rhizome.recordRouteOutcome(source.sessionId, receipt, {
    trustedVerifierDigests: [fx.DIGEST], latencyMs: 1
  });
  assert.equal((await rhizome.missionMetrics(source.sessionId, { needs: [need],
    trustedVerifierDigests: [fx.DIGEST] })).canMerge, true);
  await assert.rejects(rhizome.recordRouteOutcome(target.sessionId, receipt, {
    trustedVerifierDigests: [fx.DIGEST], latencyMs: 1
  }), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  await assert.rejects(rhizome.recordRouteOutcome(target.sessionId,
    { ...receipt, sessionId: target.sessionId }, {
      trustedVerifierDigests: [fx.DIGEST], latencyMs: 1
    }), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  assert.equal(target.routeResults.length, 0);
  assert.equal(target.graphVersion, targetVersion);
  await rhizome.closeSession(source.sessionId);
  await assert.rejects(rhizome.composeRhizome('Answer within successor mission.', {
    ...options, rhizomeId: source.sessionId
  }), { code: 'RHIZOME_SESSION_ID_MANAGED' });
  console.log('Rhizome receipts cannot cross session boundaries: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
