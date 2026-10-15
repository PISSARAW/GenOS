'use strict';

function budgetError(message) {
  return Object.assign(new Error(message), { code: 'MISSION_MODEL_BUDGET_SCOPE_INVALID' });
}

function validScope(scope) {
  if (!scope || typeof scope.id !== 'string' || !scope.id.trim()) {
    throw budgetError('A dispatched worker requires its parent model budget scope.');
  }
  if (!Number.isFinite(scope.costUsd) || scope.costUsd < 0
    || !Number.isSafeInteger(scope.tokens) || scope.tokens < 0) {
    throw budgetError('Parent model budget ceilings must be finite cost and integer tokens.');
  }
  return scope;
}

async function bindParent(ctx) {
  if (ctx.dispatchedAgent?.execution_mode !== 'orchestrator') return;
  const requested = ctx.normalizedMission.executionBudget || {};
  if (requested.costUsd == null || requested.tokens == null) return;
  const runId = ctx.executionRun?.id;
  if (!runId) throw budgetError('Parent execution run must exist before allocating model budget.');
  const budget = ctx.normalizedExecutionBudget || {};
  const workspace = ctx.dispatchedAgent.workspace_id
    ? await ctx.db.get('SELECT organization_id, project_id FROM workspaces WHERE id = ?',
      ctx.dispatchedAgent.workspace_id) : null;
  const scope = validScope({
    id: `execution-run:${runId}`,
    costUsd: Number(budget.costUsd),
    tokens: Number(budget.tokens),
    organizationId: workspace?.organization_id || null,
    projectId: workspace?.project_id || null
  });
  await ctx.db.run(`INSERT OR IGNORE INTO mission_model_budget_scopes
    (scope_id, parent_run_id, parent_agent_id, organization_id, project_id,
     cost_ceiling_usd, token_ceiling) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  scope.id, runId, ctx.agentId, scope.organizationId, scope.projectId,
  scope.costUsd, scope.tokens);
  await assertPersisted(ctx.db, scope, ctx.agentId);
  ctx.normalizedMission.modelBudgetScope = scope;
}

async function assertPersisted(db, scope, parentId) {
  const row = await db.get('SELECT * FROM mission_model_budget_scopes WHERE scope_id = ?', scope.id);
  if (!row || row.parent_agent_id !== parentId
    || row.cost_ceiling_usd !== scope.costUsd || row.token_ceiling !== scope.tokens
    || row.organization_id !== scope.organizationId
    || row.project_id !== scope.projectId) {
    throw budgetError('Parent model budget scope does not match its persisted authority.');
  }
}

async function teamWorkspaceScope(db, orchestratorAgentId) {
  const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', orchestratorAgentId)
    .catch(() => null);
  if (!agent || !agent.workspace_id) return {};
  const workspace = await db.get('SELECT organization_id, project_id FROM workspaces WHERE id = ?',
    agent.workspace_id).catch(() => null);
  if (!workspace) return {};
  return { organizationId: workspace.organization_id || null,
    projectId: workspace.project_id || null };
}

function validateTeamScopeInput(input) {
  const { db, teamRunId, orchestratorAgentId } = input;
  if (typeof db?.run !== 'function' || typeof db?.get !== 'function') {
    throw budgetError('A persistent database is required for shared model reservations.');
  }
  if (!teamRunId || !orchestratorAgentId) {
    throw budgetError('Team model budget scope requires a team run and its parent orchestrator.');
  }
}

function completeTeamBudget(input) {
  return input.budget?.costUsd != null && input.budget?.tokens != null;
}

async function resolveTeamScope(input) {
  const { db, teamRunId, orchestratorAgentId, budget, organizationId, projectId } = input;
  const fallback = organizationId == null || projectId == null
    ? await teamWorkspaceScope(db, orchestratorAgentId) : {};
  return validScope({
    id: `team-run:${teamRunId}`,
    costUsd: Number(budget.costUsd),
    tokens: Number(budget.tokens),
    organizationId: organizationId ?? fallback.organizationId ?? null,
    projectId: projectId ?? fallback.projectId ?? null
  });
}

async function persistTeamScope(input, scope) {
  const { db, teamRunId, orchestratorAgentId } = input;
  await db.run(`INSERT OR IGNORE INTO mission_model_budget_scopes
    (scope_id, parent_run_id, parent_agent_id, organization_id, project_id,
     cost_ceiling_usd, token_ceiling) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  scope.id, teamRunId, orchestratorAgentId, scope.organizationId, scope.projectId,
  scope.costUsd, scope.tokens);
  await assertPersisted(db, scope, orchestratorAgentId);
  return scope;
}

async function bindTeamScope(input) {
  validateTeamScopeInput(input);
  if (!completeTeamBudget(input)) return null;
  const scope = await resolveTeamScope(input);
  return persistTeamScope(input, scope);
}

async function routeBudget(mission, db) {
  const scope = validScope(mission.modelBudgetScope);
  if (!db || typeof db.exec !== 'function' || typeof db.run !== 'function'
    || typeof db.get !== 'function') {
    throw budgetError('A persistent database is required for shared model reservations.');
  }
  const childCost = Number(mission.executionBudget?.costUsd);
  if (!Number.isFinite(childCost) || childCost < 0) {
    throw budgetError('Dispatched worker cost ceiling is missing or invalid.');
  }
  await assertPersisted(db, scope, mission.orchestratorAgentId || mission.agentId);
  return {
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    budgetReservationId: scope.id,
    reservationCostCeilingUsd: scope.costUsd,
    budgetMaxTokens: scope.tokens,
    maxCostUsd: childCost
  };
}

module.exports = { bindParent, bindTeamScope, routeBudget, validScope };
