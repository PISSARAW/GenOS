'use strict';

/**
 * @file testMemory.js
 * @description Memory & Experience tests
 */

async function runMemoryTests(options = {}) {
  const { request, assert, smokeTenantHeaders } = options;
  console.log('\n--- 9. Memory & Experience: Vector Search, Cherry-Pick & What-If ---');
  const memSearchRes = await request({
    method: 'POST',
    path: '/api/memory/search',
    headers: smokeTenantHeaders
  }, { query: 'sqlite wal concurrency locking' });
  assert(memSearchRes.status === 200 && memSearchRes.body.topSuccessfulGoldenPaths.length > 0, 'POST /api/memory/search executed hybrid cosine vector search');

  const cherryRes = await request({
    method: 'POST',
    path: '/api/memory/cherry-pick',
    headers: smokeTenantHeaders
  }, { turns: [{ step: 1, action: 'view_file' }, { step: 2, error: 'fail' }, { step: 3, success: true, action: 'replace_file_content' }] });
  assert(cherryRes.status === 200 && cherryRes.body.prunedStepCount < cherryRes.body.originalStepCount, 'POST /api/memory/cherry-pick pruned dead-ends into Golden Path');

  const whatIfRes = await request({
    method: 'POST',
    path: '/api/memory/counterfactual',
    headers: smokeTenantHeaders
  }, { stepIndex: 2, alterations: { ruleInjected: 'Strict validation' } });
  assert(whatIfRes.status === 200 && whatIfRes.body.comparison.counterfactualTimeline.finalStatus === 'SUCCESS', 'POST /api/memory/counterfactual simulated branching timeline comparison');
}

module.exports = { runMemoryTests };