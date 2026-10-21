'use strict';

const assert = require('node:assert/strict');
const helpers = require('../bin/orchestratorMissionHelpers.cjs');
const workspaceBinding = require('../src/services/orchestratorWorkspaceBindingService');

function assertBudgetSources() {
  assert.deepEqual(helpers.requestedMissionBudget(
    { budget: { tokens: 1200, cost_usd: 0.25 } }, {}
  ), { tokens: 1200, costUsd: 0.25 });
  assert.deepEqual(helpers.requestedMissionBudget(
    { budget_tokens: 2200, budget_cost_usd: 0.5 }, {}
  ), { tokens: 2200, costUsd: 0.5 });
  assert.deepEqual(helpers.requestedMissionBudget(
    { executionBudget: { tokens: 3200, costUsd: 0.75 } },
    { budget: { tokens: 1, costUsd: 1 } }
  ), { tokens: 3200, costUsd: 0.75 });
}

function assertPlatformPathSemantics() {
  const upper = process.platform === 'win32' ? 'C:\\Repo' : '/Repo';
  const lower = process.platform === 'win32' ? 'c:\\repo' : '/repo';
  assert.equal(workspaceBinding.samePath(upper, lower), process.platform === 'win32');
}

async function assertResolvedWorkspaceIsRetained() {
  const db = {
    get: async () => ({ metadata_json: '{}', workspace_id: 'resolved-workspace' })
  };
  const state = await helpers.loadMissionAgentState(db, 'root', { workspace_root: 'C:\\Repo' });
  assert.equal(state.workspaceId, 'resolved-workspace');
}

async function main() {
  assertBudgetSources();
  assertPlatformPathSemantics();
  await assertResolvedWorkspaceIsRetained();
  console.log('Orchestrator mission helper budget, workspace and path checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
