'use strict';

const workspaceBinding = require('../src/services/orchestratorWorkspaceBindingService');

function firstDefined(values, fallback) {
  const found = values.find((value) => value !== undefined && value !== null);
  return found === undefined ? fallback : found;
}

function requestedMissionBudget(policyRequest, request) {
  const budget = firstDefined([
    policyRequest.executionBudget, policyRequest.execution_budget,
    request.executionBudget, request.execution_budget
  ], {});
  const base = { ...budget };
  base.tokens = firstDefined([
    base.tokens, policyRequest.budget?.tokens, request.budget?.tokens,
    policyRequest.budget_tokens, request.budget_tokens, policyRequest.tokens, request.tokens
  ]);
  base.costUsd = firstDefined([
    base.costUsd, base.cost_usd, policyRequest.budget?.costUsd,
    policyRequest.budget?.cost_usd, request.budget?.costUsd, request.budget?.cost_usd,
    policyRequest.budget_cost_usd, request.budget_cost_usd,
    policyRequest.costUsd, policyRequest.cost_usd, request.costUsd, request.cost_usd
  ]);
  return base;
}

async function loadMissionAgentState(db, id, request) {
  const requestedWorkspaceId = request.workspaceId || request.workspace_id || null;
  if (requestedWorkspaceId) {
    await workspaceBinding.bind({ db, agentId: id, workspaceId: requestedWorkspaceId, request });
  }
  const existing = await db.get(
    'SELECT metadata_json, workspace_id FROM agents WHERE id = ?', id
  ).catch(() => null);
  return { existing, workspaceId: requestedWorkspaceId || existing?.workspace_id || null };
}

module.exports = { loadMissionAgentState, requestedMissionBudget };
