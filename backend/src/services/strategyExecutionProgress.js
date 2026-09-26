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

async function selfModelCompletionBlock(db, agentId, payload) {
  try {
    const data = payload || {};
    const selfModel = require('./selfModelService');
    const model = await selfModel.load(db, agentId, {});
    selfModel.assertPromotionConstraints(model, {
      replayVerified: data.replayVerified,
      diffAndReplayPassed: data.diffAndReplayPassed,
      replayReceipt: data.replayReceipt,
      evidenceVerified: data.evidenceVerified,
      independentVerification: data.independentVerification,
      report: data.evidenceReport || data.report
    });
  } catch (error) {
    if (error && error.code === 'SELF_MODEL_REPLAY_REQUIRED') return 'Self-model requires replay verification before promotion.';
    if (error && error.code === 'SELF_MODEL_EVIDENCE_REQUIRED') return 'Self-model requires independent evidence before promotion.';
    return null;
  }
  return null;
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
    guardrailReason = promotionGate.completionGuardrail(contract, event.payload, row.agent_id)
      || await selfModelCompletionBlock(db, row.agent_id, event.payload);
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

// The runtime emits coarse lifecycle events (plan created, think, execute,
// verify, completed) that do not map one-to-one onto the contract pipeline.
// When an event enters phase N, the phases before it that the runtime never
// touched are not failures: mark untouched ones `skipped` and started ones
// `completed` so the linear gate does not halt an otherwise valid mission.
async function settlePredecessorSteps(db, steps, index) {
  const now = new Date().toISOString();
  for (const step of steps) {
    if (step.sequence >= index) continue;
    if (step.status === 'planned') {
      await db.run("UPDATE strategy_execution_steps SET status = 'skipped', completed_at = ? WHERE id = ? AND status = 'planned'", now, step.id);
      step.status = 'skipped';
    } else if (step.status === 'running') {
      await db.run("UPDATE strategy_execution_steps SET status = 'completed', completed_at = COALESCE(completed_at, ?) WHERE id = ? AND status = 'running'", now, step.id);
      step.status = 'completed';
    }
  }
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
    context: { ...stepTaskContext(outcome), contractId: outcome.contractId, stageKey: step.stage_key }
  });
  if (result && result.applicable === false) {
    return { result, guardrailReason: outcome.guardrailReason, inapplicable: true };
  }
  const failure = events.primitiveFailureReason(step, result);
  if (failure) return { result, guardrailReason: failure };
  return { result, guardrailReason: outcome.guardrailReason };
}

async function skipInapplicableStep(db, step, now) {
  await db.run(
    "UPDATE strategy_execution_steps SET status = 'skipped', completed_at = ? WHERE id = ? AND status = 'planned'",
    now, step.id
  );
  step.status = 'skipped';
  step.completed_at = now;
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
  if (primitiveExec && primitiveExec.controlRegulation) {
    evidence.push({ controlRegulation: primitiveExec.controlRegulation, timestamp: record.now });
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
  // A settled phase must not regress to `running` when a later event maps back
  // to it (the runtime event ordering is not strictly monotonic).
  if (['completed', 'skipped'].includes(steps[index].status)) return outcome.guardrailReason;
  const execution = await maybeRunStepPrimitives(db, steps[index], outcome);
  if (execution.inapplicable) {
    await skipInapplicableStep(db, steps[index], outcome.now);
  } else {
    await persistStepProgress(db, steps[index], { outcome, execution });
  }
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
  const gateIndex = events.stepIndex(event, steps.length);
  if (gateIndex > 0) await settlePredecessorSteps(db, steps, gateIndex);
  const index = applyPhaseGate(outcome, steps, event);
  const guardrailReason = await advanceExecutionStep(db, { steps, index }, outcome);
  await skipRemainingSteps(db, { rowId: row.id, event, guardrailReason, now: outcome.now });
  const saved = await persistRunProgress(db, row, { outcome, guardrailReason });
  return { run: saved.run, halt: saved.halt, reason: saved.reason, failed: saved.failed, guardrailReason };
}

module.exports = {
  recordExecutionEvent
};
