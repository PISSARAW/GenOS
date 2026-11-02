'use strict';

const { TABLES_MODEL_ATTEMPTS } = require('../../db/schema-model-attempts');
const { digest } = require('../evidenceProtocol/canonical');
const budgets = require('../missionModelBudgetScope');
const provenance = require('../gvxMissionProvenance');

function validate(input) {
  if (!Number.isSafeInteger(input.tokens) || input.tokens < 0 || !Number.isFinite(input.costUsd) || input.costUsd < 0
    || !Number.isSafeInteger(input.latencyMs) || input.latencyMs <= 0) throw new Error('WINDOWS_PROTOCOL_BUDGET_INVALID');
  return { ...input };
}

const descriptor = row => ({ id: row.scope_id, tokens: row.token_ceiling, costUsd: row.cost_ceiling_usd,
  organizationId: row.organization_id, projectId: row.project_id });

async function parentScope(ctx, requested) {
  const parentId = ctx.dispatchedAgent.parent_agent_id;
  const rows = requested ? [await ctx.db.get('SELECT * FROM mission_model_budget_scopes WHERE scope_id=?', requested.id)]
    : await ctx.db.all('SELECT * FROM mission_model_budget_scopes WHERE parent_agent_id=? ORDER BY rowid DESC', parentId);
  for (const row of rows.filter(Boolean)) {
    const scope = await provenance.requireAgentScope(ctx.db, row.parent_agent_id);
    const native = await provenance.readRun(ctx.db, { runId: row.parent_run_id, scope });
    if (native?.mission.id === ctx.normalizedMission.missionId) return row;
  }
  throw new Error('WINDOWS_PROTOCOL_PARENT_BUDGET_REQUIRED');
}

async function localScope(ctx) {
  const scope = await provenance.requireAgentScope(ctx.db, ctx.agentId);
  const requested = ctx.normalizedExecutionBudget;
  const id = `execution-run:${ctx.executionRun.id}`;
  await ctx.db.run(`INSERT OR IGNORE INTO mission_model_budget_scopes
    (scope_id,parent_run_id,parent_agent_id,organization_id,project_id,cost_ceiling_usd,token_ceiling)
    VALUES(?,?,?,?,?,?,?)`, id, ctx.executionRun.id, ctx.agentId, scope.organizationId, scope.projectId,
  requested.costUsd, requested.tokens);
  return ctx.db.get('SELECT * FROM mission_model_budget_scopes WHERE scope_id=?', id);
}

async function bind(ctx, requested) {
  await ctx.db.exec(TABLES_MODEL_ATTEMPTS);
  const row = requested || ctx.dispatchedAgent.parent_agent_id ? await parentScope(ctx, requested) : await localScope(ctx);
  const scope = budgets.validScope(descriptor(row));
  if (requested && digest(scope) !== digest(requested)) throw new Error('WINDOWS_PROTOCOL_PARENT_BUDGET_CHANGED');
  const tenant = await provenance.requireAgentScope(ctx.db, ctx.agentId);
  if (scope.organizationId !== tenant.organizationId || scope.projectId !== tenant.projectId) throw new Error('WINDOWS_PROTOCOL_BUDGET_TENANT_MISMATCH');
  const budget = ctx.normalizedExecutionBudget;
  if (budget.tokens > scope.tokens || budget.costUsd > scope.costUsd) throw new Error('WINDOWS_PROTOCOL_CHILD_BUDGET_EXCEEDS_PARENT');
  ctx.normalizedMission.modelBudgetScope = scope;
  ctx.normalizedMission.orchestratorAgentId = ctx.dispatchedAgent.parent_agent_id || ctx.agentId;
  await budgets.routeBudget(ctx.normalizedMission, ctx.db);
  return scope;
}

module.exports = { validate, bind };
