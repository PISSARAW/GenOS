/**
 * Strategy run-progress persistence (extraction of strategyExecutionService).
 *
 * Implements recordExecutionEvent by composing strategyExecutionEvents
 * (reads, metrics, primitives) and strategyPromotionGate (completion gate).
 * The adaptation service is required lazily: it depends back on the
 * execution facade, so a top-level require would close a cycle.
 */

const events = require('./strategyExecutionEvents');
const promotionGate = require('./strategyPromotionGate');

function runEventFlags(event) {
  return {
    blocked: ['BUDGET_EXHAUSTED', 'AGENT_HALTED'].includes(event.eventType),
    failed: ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(event.eventType),
    completed: ['AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN'].includes(event.eventType)
  };
}

function blockedReason(event, blocked) {
  if (!blocked) return null;
  return event.detail || 'execution blocked by runtime guardrail';
}

function requiresHumanApproval(contract) {
  const promotion = contract.promotion || {};
  return promotion.require_human_approval === true;
}

async function completionContract(db, row) {
  const strategyContracts = require('./strategyContractService');
  const record = await strategyContracts.getContractById(db, row.contract_id);
  const entry = record || {};
  return entry.contract || {};
}

function accumulateMetrics(previous, delta, startedAt) {
  return {
    tokens: Number(previous.tokens || 0) + delta.tokens,
    inputTokens: Number(previous.inputTokens || 0) + delta.inputTokens,
    cachedInputTokens: Number(previous.cachedInputTokens || 0) + delta.cachedInputTokens,
    outputTokens: Number(previous.outputTokens || 0) + delta.outputTokens,
    billableTokens: Number(previous.billableTokens || 0) + delta.billableTokens,
    costUsd: Number((Number(previous.costUsd || 0) + delta.costUsd).toFixed(6)),
    latencyMs: Math.max(0, Date.now() - startedAt),
    events: Number(previous.events || 0) + 1
  };
}

async function resolveRunOutcome(db, row, context) {
  const event = context.event;
  const delta = events.metricDelta(event.payload);
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : Date.now();
  const metrics = accumulateMetrics(events.safeJson(row.metrics_json, {}), delta, startedAt);
  const budget = events.safeJson(row.budget_json, events.DEFAULT_BUDGET);
  const flags = runEventFlags(event);
  let guardrailReason = events.policyViolation(event) || blockedReason(event, flags.blocked) || events.exceededGuardrail(metrics, budget);
  const contract = await completionContract(db, row);
  if (flags.completed && !guardrailReason) {
    const reason = promotionGate.completionGuardrail(contract, event.payload, row.agent_id);
    if (reason) guardrailReason = reason;
  }
  const approvalRequired = flags.completed && !guardrailReason && requiresHumanApproval(contract);
  return {
    event, delta, metrics, flags, contract, approvalRequired, guardrailReason,
    agentId: context.agentId, contractId: row.contract_id, rowStatus: row.status, now: new Date().toISOString()
  };
}

function applyPhaseGate(outcome, steps, event) {
  const index = events.stepIndex(event, steps.length);
  if (!outcome.guardrailReason) outcome.guardrailReason = events.unfinishedPhaseReason(steps, index);
  return index;
}

function eventRunId(event) {
  const payload = event.payload || {};
  return payload.executionRunId || null;
}

async function findActiveRun(db, agentId, executionRunId) {
  if (executionRunId) {
    return db.get("SELECT * FROM strategy_execution_runs WHERE id = ? AND agent_id = ? AND status IN ('planned', 'running')", executionRunId, agentId);
  }
  return db.get("SELECT * FROM strategy_execution_runs WHERE agent_id = ? AND status IN ('planned', 'running') ORDER BY created_at DESC LIMIT 1", agentId);
}

function stepTaskContext(outcome) {
  const payload = outcome.event.payload || {};
  return { ...payload, task: outcome.event.detail };
}

async function maybeRunStepPrimitives(db, step, outcome) {
  if (outcome.guardrailReason || step.status !== 'planned') {
    return { result: null, guardrailReason: outcome.guardrailReason };
  }
  const result = await events.executeStepPrimitives(db, outcome.agentId, {
    step,
    contractId: outcome.contractId,
    context: stepTaskContext(outcome)
  });
  const failure = events.primitiveFailureReason(step, result);
  if (failure) return { result, guardrailReason: failure };
  return { result, guardrailReason: outcome.guardrailReason };
}

function appendStepEvidence(step, record) {
  const parsed = events.safeJson(step.evidence_json, []);
  const evidence = Array.isArray(parsed) ? parsed : [];
  const event = record.event;
  evidence.push({ eventType: event.eventType, action: event.action, detail: event.detail, timestamp: record.now });
  const primitiveExec = record.primitiveExec;
  if (primitiveExec && Array.isArray(primitiveExec.results) && primitiveExec.results.length) {
    evidence.push({ primitiveResults: primitiveExec.results, success: primitiveExec.success, timestamp: record.now });
  }
  return evidence;
}

function accumulateStepMetrics(step, delta) {
  const current = events.safeJson(step.actual_metrics_json, {});
  return {
    tokens: Number(current.tokens || 0) + delta.tokens,
    inputTokens: Number(current.inputTokens || 0) + delta.inputTokens,
    cachedInputTokens: Number(current.cachedInputTokens || 0) + delta.cachedInputTokens,
    outputTokens: Number(current.outputTokens || 0) + delta.outputTokens,
    billableTokens: Number(current.billableTokens || 0) + delta.billableTokens,
    costUsd: Number(current.costUsd || 0) + delta.costUsd
  };
}

function resolveStepStatus(guardrailReason, flags) {
  if (guardrailReason) return 'blocked';
  if (flags.failed) return 'failed';
  if (flags.approvalRequired) return 'awaiting_approval';
  if (flags.completed) return 'completed';
  return 'running';
}

function stepCompletedAt(guardrailReason, flags, now) {
  if (guardrailReason || flags.failed || flags.completed) return now;
  return null;
}

async function persistStepProgress(db, step, request) {
  const outcome = request.outcome;
  const execution = request.execution;
  const evidence = appendStepEvidence(step, { event: outcome.event, primitiveExec: execution.result, now: outcome.now });
  const metrics = accumulateStepMetrics(step, outcome.delta);
  await db.run(
    `UPDATE strategy_execution_steps SET status = ?, actual_metrics_json = ?, evidence_json = ?,
     started_at = COALESCE(started_at, ?), completed_at = ? WHERE id = ?`,
    resolveStepStatus(execution.guardrailReason, {
      failed: outcome.flags.failed,
      approvalRequired: outcome.approvalRequired,
      completed: outcome.flags.completed
    }),
    JSON.stringify(metrics),
    JSON.stringify(evidence.slice(-50)),
    outcome.now,
    stepCompletedAt(execution.guardrailReason, outcome.flags, outcome.now),
    step.id
  );
}

async function advanceExecutionStep(db, plan, outcome) {
  const steps = plan.steps;
  const index = plan.index;
  if (index < 0 || !steps[index]) return outcome.guardrailReason;
  const execution = await maybeRunStepPrimitives(db, steps[index], outcome);
  await persistStepProgress(db, steps[index], { outcome, execution });
  return execution.guardrailReason;
}

async function skipRemainingSteps(db, request) {
  if (!events.FINAL_EVENTS.has(request.event.eventType) && !request.guardrailReason) return;
  await db.run("UPDATE strategy_execution_steps SET status = 'skipped', completed_at = ? WHERE run_id = ? AND status = 'planned'", request.now, request.rowId);
}

function runStatusOf(outcome, guardrailReason) {
  if (guardrailReason) return 'blocked';
  if (outcome.flags.failed) return 'failed';
  if (outcome.approvalRequired) return 'awaiting_approval';
  if (outcome.flags.completed) return 'completed';
  if (outcome.rowStatus === 'planned') return 'running';
  return outcome.rowStatus;
}

function completedRunAt(status, now) {
  if (status === 'awaiting_approval' || status === 'completed' || status === 'failed' || status === 'blocked') return now;
  return null;
}

async function persistRunProgress(db, row, progress) {
  const outcome = progress.outcome;
  const status = runStatusOf(outcome, progress.guardrailReason);
  await db.run(
    `UPDATE strategy_execution_runs SET status = ?, metrics_json = ?, guardrail_reason = ?,
     started_at = COALESCE(started_at, ?), completed_at = ? WHERE id = ?`,
    status,
    JSON.stringify(outcome.metrics),
    progress.guardrailReason,
    outcome.now,
    completedRunAt(status, outcome.now),
    row.id
  );
  return { run: await events.getRun(db, row.id), halt: Boolean(progress.guardrailReason), reason: progress.guardrailReason, failed: outcome.flags.failed };
}

async function recordExecutionEvent(db, agentId, event) {
  const row = await findActiveRun(db, agentId, eventRunId(event));
  if (!row) return null;
  const outcome = await resolveRunOutcome(db, row, { agentId, event });
  const steps = await db.all('SELECT * FROM strategy_execution_steps WHERE run_id = ? ORDER BY sequence', row.id);
  const index = applyPhaseGate(outcome, steps, event);
  const guardrailReason = await advanceExecutionStep(db, { steps, index }, outcome);
  await skipRemainingSteps(db, { rowId: row.id, event, guardrailReason, now: outcome.now });
  const saved = await persistRunProgress(db, row, { outcome, guardrailReason });
  return { run: saved.run, halt: saved.halt, reason: saved.reason, failed: saved.failed, guardrailReason };
}

module.exports = {
  recordExecutionEvent
};
