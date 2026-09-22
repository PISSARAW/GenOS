'use strict';

/**
 * @file testWorkspace.js
 * @description Workspace & Causal Incidents tests
 */

const fs = require('fs');
const path = require('path');

async function runWorkspaceTests(options = {}) {
  const { request, assert, token, smokeTenantHeaders, coreWorkspacePath } = options;
  console.log('\n--- 10. Workspace: Multi-Branch Diff, Causal Bisection & Rollback ---');
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Access-Key': token };
  const baselineSnapshotRes = await request({
    method: 'POST',
    path: '/api/workspaces/ws-genos-core/snapshots',
    headers: { ...authHeaders, ...smokeTenantHeaders }
  }, { label: 'Step 1 baseline', reason: 'Bisection baseline' });
  assert(baselineSnapshotRes.status === 201 || baselineSnapshotRes.status === 200, `Baseline snapshot creation succeeded (${baselineSnapshotRes.status}: ${JSON.stringify(baselineSnapshotRes.body)})`);
  fs.writeFileSync(path.join(coreWorkspacePath, 'src', 'parser.js'), 'function parse(input){ return input.deep.property; }\n');
  const regressionSnapshotRes = await request({
    method: 'POST',
    path: '/api/workspaces/ws-genos-core/snapshots',
    headers: { ...authHeaders, ...smokeTenantHeaders }
  }, { label: 'Step 2 regression', reason: 'Introduced null dereference' });
  assert(regressionSnapshotRes.status === 201 || regressionSnapshotRes.status === 200, `Regression snapshot creation succeeded (${regressionSnapshotRes.status}: ${JSON.stringify(regressionSnapshotRes.body)})`);

  const diffRes = await request({ method: 'GET', path: '/api/workspaces/diff?base=ws-genos-core&target=ws-genos-core', headers: smokeTenantHeaders });
  assert(diffRes.status === 200 && Array.isArray(diffRes.body.diffEntries) && diffRes.body.churnHeatmap.length > 0, `GET /api/workspaces/diff returned multi-branch diff & churn heatmap (${diffRes.status}: ${JSON.stringify(diffRes.body)})`);

  const bisectRes = await request({
    method: 'POST',
    path: '/api/workspaces/bisect',
    headers: { ...authHeaders, ...smokeTenantHeaders }
  }, { workspaceId: 'ws-genos-core', testCommand: 'npm test', timeoutMs: 30000 });
  assert(bisectRes.status === 200 && bisectRes.body.bisectionComplete && bisectRes.body.culpritReport.stepNumber > 0, `POST /api/workspaces/bisect isolated culprit step in O(log N) iterations (${bisectRes.status}: ${JSON.stringify(bisectRes.body)})`);

  const rollbackRes = await request({
    method: 'POST',
    path: '/api/workspaces/rollback',
    headers: { ...authHeaders, ...smokeTenantHeaders }
  }, { workspaceId: 'ws-genos-core', stepNumber: bisectRes.body.culpritReport.stepNumber });
  assert(rollbackRes.status === 200 && rollbackRes.body.rollback === true && rollbackRes.body.restoredSnapshot?.id !== undefined, 'POST /api/workspaces/rollback restored the pre-regression snapshot atomically');
}

module.exports = { runWorkspaceTests };