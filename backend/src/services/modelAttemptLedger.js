const crypto = require('crypto');
const routingPolicy = require('./modelRoutingPolicy');

function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function usageFrom(result) {
  const inputTokens = tokenCount(result && result.inputTokens);
  const outputTokens = tokenCount(result && result.outputTokens);
  const known = inputTokens !== null && outputTokens !== null;
  return { inputTokens, outputTokens,
    tokenUsageSource: known ? (result.tokenUsageMeasured === true ? 'provider' : 'estimate') : 'unknown' };
}

function attemptIdentity(ctx, uri) {
  if (!ctx.routeActionId) ctx.routeActionId = crypto.randomUUID();
  return { id: crypto.randomUUID(), actionId: ctx.routeActionId,
    missionId: ctx.executionRunId || ctx.missionId || null,
    organizationId: ctx.organizationId || null, projectId: ctx.projectId || null,
    agentId: ctx.agentId || null, model: uri,
    budgetReservationId: ctx.budgetReservationId || null };
}

async function startAttempt(db, attempt) {
  if (!db || typeof db.run !== 'function') return;
  await db.run(`INSERT OR IGNORE INTO model_attempt_ledger
    (id, mission_id, action_id, organization_id, project_id, agent_id, model,
     status, token_usage_source, budget_reservation_id, started_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  attempt.id, attempt.missionId, attempt.actionId, attempt.organizationId,
  attempt.projectId, attempt.agentId, attempt.model, 'started', 'unknown',
  attempt.budgetReservationId, new Date().toISOString());
}

async function finishAttempt(db, attempt) {
  if (!db || typeof db.run !== 'function') return;
  await db.run(`UPDATE model_attempt_ledger SET status = ?, provider_called = ?,
    input_tokens = ?, output_tokens = ?, token_usage_source = ?, cost_usd = ?,
    estimated_cost_usd = ?, error_code = ?, finished_at = ?
    WHERE id = ? AND status = 'started'`,
  attempt.status, attempt.providerCalled ? 1 : 0, attempt.inputTokens ?? null,
  attempt.outputTokens ?? null, attempt.tokenUsageSource || 'unknown',
  attempt.costUsd ?? null, attempt.estimatedCostUsd ?? null,
  attempt.errorCode || null, new Date().toISOString(), attempt.id);
}

async function reconcileLateAttempt(db, attempt) {
  if (!db || typeof db.run !== 'function') return;
  await db.run(`UPDATE model_attempt_ledger SET input_tokens = ?, output_tokens = ?,
    token_usage_source = 'provider', cost_usd = ?
    WHERE id = ? AND status IN ('timeout', 'failed')
      AND token_usage_source = 'unknown'`,
  attempt.inputTokens, attempt.outputTokens, attempt.costUsd, attempt.id);
}

async function recordModelUsage(db, scope, result) {
  if (!db || typeof db.run !== 'function' || !scope.organizationId || !scope.projectId) return;
  const usage = usageFrom(result);
  if (usage.tokenUsageSource === 'unknown') return;
  await db.run(
    'INSERT OR IGNORE INTO usage_ledger(id, organization_id, project_id, release_id, category, quantity, cost_usd, metadata_json) VALUES(?,?,?,?,?,?,?,?)',
    `usage-model-${result.routeAttemptId || crypto.randomUUID()}`,
    scope.organizationId, scope.projectId,
    null, 'model_inference', usage.inputTokens + usage.outputTokens,
    result.costUsd ?? 0,
    JSON.stringify({ model: result.model, requestedModel: result.requestedModel,
      servedModel: result.servedModel, provider: result.provider,
      routeAttemptId: result.routeAttemptId, executionRunId: scope.executionRunId,
      agentId: scope.agentId, inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      tokenUsageMeasured: usage.tokenUsageSource === 'provider',
      tokenUsageSource: usage.tokenUsageSource, latencyMs: result.latencyMs,
      transportSuccess: result.success !== false,
      attemptStatus: result.attemptStatus || 'completed' })
  );
}

function failureCost(outcome, usage) {
  if (!outcome.providerCalled) return 0;
  if (usage.tokenUsageSource === 'unknown') return null;
  const registered = outcome.prepared.registered || {};
  return routingPolicy.estimateCostUsd({ costInput: Number(registered.cost_input || 0),
    costOutput: Number(registered.cost_output || 0) }, usage.inputTokens, usage.outputTokens);
}

function failureStatus(error) {
  if (error.code === 'MODEL_ROUTE_DEADLINE_EXCEEDED') return 'timeout';
  if (error.code === 'MODEL_COST_BUDGET_EXCEEDED'
    || error.code === 'MODEL_TOKEN_BUDGET_EXCEEDED') return 'skipped_budget';
  return 'failed';
}

async function recordFailedAttempt({ ctx, outcome, error }) {
  const usage = usageFrom(error.usage || error);
  const costUsd = failureCost(outcome, usage);
  const status = failureStatus(error);
  const known = outcome.providerCalled ? usage : { inputTokens: 0, outputTokens: 0,
    tokenUsageSource: 'not_called' };
  await finishAttempt(ctx.db, { ...outcome, ...known, costUsd, status,
    errorCode: error.code || 'MODEL_ROUTE_FAILED' });
  if (outcome.providerCalled && usage.tokenUsageSource !== 'unknown') {
    await recordModelUsage(ctx.db, { organizationId: ctx.organizationId,
      projectId: ctx.projectId, executionRunId: ctx.executionRunId, agentId: ctx.agentId },
    { ...usage, tokenUsageMeasured: usage.tokenUsageSource === 'provider',
      model: outcome.uri, routeAttemptId: outcome.id, costUsd,
      attemptStatus: status, success: false });
  }
  return costUsd;
}

module.exports = { attemptIdentity, startAttempt, finishAttempt, reconcileLateAttempt,
  recordModelUsage, recordFailedAttempt, usageFrom };
