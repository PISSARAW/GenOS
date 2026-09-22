'use strict';

/**
 * @file testBiology.js
 * @description Biology & Resilience tests
 */

async function runBiologyTests(options = {}) {
  const { request, assert, token, smokeTenantHeaders } = options;
  console.log('\n--- 7. Biology & Resilience: Apoptosis Autopsy & Cryptobiosis ---');
  const apopRes = await request({
    method: 'POST',
    path: '/api/resilience/apoptosis',
    headers: { Authorization: `Bearer ${token}`, 'X-Access-Key': token }
  }, { agentId: 'test_divergent_agent', triggerMetrics: { consecutiveFailures: 4 } });
  assert(apopRes.status === 200 && apopRes.body.apoptosisExecuted === true && apopRes.body.terminalCallStack.length > 0, 'POST /api/resilience/apoptosis generated automated autopsy report');

  const freezeRes = await request({
    method: 'POST',
    path: '/api/resilience/cryptobiosis/freeze',
    headers: { Authorization: `Bearer ${token}`, 'X-Access-Key': token, ...smokeTenantHeaders }
  }, { workspaceId: 'ws-genos-core', reason: 'Verification Freeze' });
  assert(freezeRes.status === 200 && freezeRes.body.snapshotId.startsWith('cryptobiosis_'), 'POST /api/resilience/cryptobiosis/freeze created instant state snapshot');

  const thawRes = await request({
    method: 'POST',
    path: '/api/resilience/cryptobiosis/thaw',
    headers: { Authorization: `Bearer ${token}`, ...smokeTenantHeaders }
  }, { snapshotId: freezeRes.body.snapshotId });
  assert(thawRes.status === 200 && thawRes.body.success === true, 'POST /api/resilience/cryptobiosis/thaw revived runtime state');

  const driftRes = await request({
    method: 'POST',
    path: '/api/resilience/drift'
  }, { ancestorPrompt: 'Refactor parser with guard clauses', currentPrompt: 'Refactor parser with recursive loop' });
  assert(driftRes.status === 200 && driftRes.body.driftScore >= 0, 'POST /api/resilience/drift evaluated prompt mutation Levenshtein drift');
}

module.exports = { runBiologyTests };