const crypto = require('crypto');
const strategyContracts = require('./strategyContractService');

// A single Codex runtime turn includes the injected strategy contract and
// Codex's own context.  120k falls below that fixed baseline and incorrectly
// kills otherwise completed missions before their result can be recorded.
const DEFAULT_BUDGET = Object.freeze({ tokens: 500000, costUsd: 5, latencyMs: 30 * 60 * 1000, events: 500 });
const MAX_RUN_LIST_LIMIT = 100;
const FINAL_EVENTS = new Set([
  'AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN',
  'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED',
  'BUDGET_EXHAUSTED', 'AGENT_HALTED'
]);

function json(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizedBudget(input = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_BUDGET).map(([key, fallback]) => {
    const value = Number(input[key]);
    return [key, Number.isFinite(value) && value > 0 ? value : fallback];
  }));
}

function compileExecutionPlan(contract, budgetInput = {}) {
  const budget = normalizedBudget(budgetInput);
  const pipeline = contract.execution_pipeline || [];
  const strategyIds = (contract.strategy_portfolio || []).map((item) => item.id);
  return {
    budget,
    steps: pipeline.map((stageKey, sequence) => ({
      sequence,
      stageKey,
      strategyIds,
      plannedBudget: Object.fromEntries(Object.entries(budget).map(([key, value]) => [key, Number((value / Math.max(pipeline.length, 1)).toFixed(3))]))
    }))
  };
}

function parseRun(row, steps = []) {
  if (!row) return null;
  const parsedSteps = steps.map((step) => ({
    id: step.id, sequence: step.sequence, stageKey: step.stage_key, status: step.status,
    strategyIds: json(step.strategy_ids_json, []), plannedBudget: json(step.planned_budget_json, {}),
    actualMetrics: json(step.actual_metrics_json, {}), evidence: json(step.evidence_json, []),
    startedAt: step.started_at, completedAt: step.completed_at
  }));
  const completed = parsedSteps.filter((step) => step.status === 'completed').length;
  const observed = parsedSteps.filter((step) => !['planned', 'skipped'].includes(step.status)).length;
  return {
    id: row.id, agentId: row.agent_id, contractId: row.contract_id, contractVersion: row.contract_version,
    status: row.status, budget: json(row.budget_json, {}), metrics: json(row.metrics_json, {}),
    guardrailReason: row.guardrail_reason, startedAt: row.started_at, completedAt: row.completed_at,
    createdAt: row.created_at, steps: parsedSteps,
    adherence: {
      planned: parsedSteps.length, observed, completed,
      percent: parsedSteps.length ? Math.round((completed / parsedSteps.length) * 100) : 0,
      deviations: parsedSteps.filter((step) => step.status !== 'completed').map((step) => ({ stageKey: step.stageKey, status: step.status }))
    }
  };
}

async function hydrateRun(db, row) {
  if (!row) return null;
  return parseRun(row, await db.all('SELECT * FROM strategy_execution_steps WHERE run_id = ? ORDER BY sequence', row.id));
}

async function createExecutionRun(db, context) {
  const contractRecord = context.contractRecord || await strategyContracts.getLatestContract(db, context.agentId);
  if (!contractRecord) throw new Error(`No strategy contract for agent ${context.agentId}`);
  const plan = compileExecutionPlan(contractRecord.contract, context.budget);
  const id = `strategy_run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await db.run(
    `INSERT INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, budget_json, metrics_json)
     VALUES (?, ?, ?, ?, 'planned', ?, ?)`,
    id, context.agentId, contractRecord.id, contractRecord.version, JSON.stringify(plan.budget),
    JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 0, events: 0 })
  );
  for (const step of plan.steps) {
    await db.run(
      `INSERT INTO strategy_execution_steps (id, run_id, sequence, stage_key, strategy_ids_json, planned_budget_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      `${id}_step_${step.sequence + 1}`, id, step.sequence, step.stageKey,
      JSON.stringify(step.strategyIds), JSON.stringify(step.plannedBudget)
    );
  }
  return getRun(db, id);
}

function metricDelta(payload = {}) {
  const usage = payload.usage || payload.item?.usage || {};
  const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0);
  // Providers report cached input as a subset of input_tokens.  Keep it
  // separate: it still occupies context, while its billing is different.
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, Number(usage.cached_input_tokens || usage.cache_read_input_tokens || 0)));
  const contextTokens = Number(payload.tokens || usage.total_tokens || (inputTokens + outputTokens) || 0);
  return {
    // `tokens` remains the backwards-compatible context guardrail.  Cost
    // guardrails continue to use costUsd supplied by the provider.
    tokens: contextTokens,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    billableTokens: Math.max(0, inputTokens - cachedInputTokens) + outputTokens,
    costUsd: Number(payload.costUsd || payload.cost_usd || usage.cost_usd || 0)
  };
}

function stepIndex(event, stepCount) {
  if (stepCount <= 0) return -1;
  if (event.eventType === 'AGENT_RUNTIME_STARTED') return 0;
  if (event.eventType === 'AGENT_PLAN_CREATED') return Math.min(1, stepCount - 1);
  if (event.eventType === 'AGENT_COMPLETED') return stepCount - 1;
  if (event.action === 'THINK') return Math.min(2, stepCount - 1);
  if (event.action === 'VERIFY') return Math.min(5, stepCount - 1);
  if (event.eventType === 'AGENT_STEP') return Math.min(3, stepCount - 1);
  return -1;
}

function unfinishedPhaseReason(steps, index) {
  if (index <= 0) return null;
  const unfinished = steps.filter((step) => step.sequence < index && !['completed', 'skipped'].includes(step.status));
  return unfinished.length
    ? `Cannot enter '${steps[index]?.stage_key}' before completing: ${unfinished.map((step) => step.stage_key).join(', ')}.`
    : null;
}

function primitiveFailureReason(step, result) {
  if (!result || result.success !== false) return null;
  return `Phase '${step.stage_key}' gate failed: ${result.error || 'strategy primitive failed'}.`;
}

function exceededGuardrail(metrics, budget) {
  for (const key of ['tokens', 'costUsd', 'latencyMs', 'events']) {
    if (metrics[key] > budget[key]) return `${key} budget exceeded (${metrics[key]} > ${budget[key]})`;
  }
  return null;
}

function policyViolation(event) {
  if (event.eventType === 'HARD_INVARIANT_FAILURE') return 'hard invariant failure';
  if (event.eventType === 'CIRCUIT_BREAKER_OPEN') return 'circuit breaker opened';
  return null;
}

const STAGE_PRIMITIVE_MAP = {
  memory_retrieval: ['search_memory', 'compile_memory', 'search_failures'],
  snapshot: ['snapshot'],
  isolated_forks: ['fork', 'mcts_select'],
  instrumented_run: ['vfs_dry_run', 'run'],
  adaptive_evaluation: ['evaluate', 'verify'],
  diff_and_replay: ['safe_revert'],
  audit: ['provenance', 'dependency_matrix'],
  conditional_promotion: ['select_winner', 'stdp_update', 'cherry_pick_golden_path']
};

function resolveStagePrimitives(stageKey, portfolio = []) {
  const defaults = STAGE_PRIMITIVE_MAP[stageKey] || [];
  const portfolioPrimitives = (portfolio || []).flatMap((s) => s.primitives || []);
  const matching = portfolioPrimitives.filter((p) => defaults.includes(p));
  // STRICT: Do not fall back to defaults if portfolio has no matching primitives.
  // This ensures that only contracted primitives are executed.
  if (matching.length === 0 && defaults.length > 0) {
    throw Object.assign(
      new Error(`Stage '${stageKey}' requires one of [${defaults.join(', ')}] but the selected strategy portfolio does not support any. Portfolio primitives: [${portfolioPrimitives.join(', ') || 'none'}]`),
      { code: 'STRATEGY_PORTFOLIO_UNSUPPORTED_STAGE', stageKey, required: defaults, available: portfolioPrimitives }
    );
  }
  return [...new Set(matching)];
}

async function executeStepPrimitives(db, agentId, options = {}) {
  const { step, context = {} } = options;
  if (!step) return { success: true, results: [] };
  try {
    const contractRow = options.contractId
      ? await db.get('SELECT contract_json FROM strategy_contracts WHERE id = ?', options.contractId)
      : await db.get(
        'SELECT contract_json FROM strategy_contracts WHERE agent_id = ? AND status = "active" ORDER BY version DESC LIMIT 1',
        agentId
      );
    const contract = json(contractRow?.contract_json, {});
    const stageKey = step.stage_key || step.stageKey || '';
    const primitives = resolveStagePrimitives(stageKey, contract.strategy_portfolio);
    if (!primitives.length) return { success: true, results: [] };
    const execContext = {
      agentId,
      orchestratorId: agentId,
      workspaceId: context.workspaceId,
      task: context.task || context.detail,
      ...context
    };
    const adapter = require('./strategyExecutionAdapter');
    return await adapter.executePipelineWithFeedback(primitives, execContext);
  } catch (err) {
    return { success: false, error: err.message, results: [] };
  }
}

async function recordExecutionEvent(db, agentId, event) {
  const executionRunId = event.payload?.executionRunId;
  const row = executionRunId
    ? await db.get("SELECT * FROM strategy_execution_runs WHERE id = ? AND agent_id = ? AND status IN ('planned', 'running')", executionRunId, agentId)
    : await db.get("SELECT * FROM strategy_execution_runs WHERE agent_id = ? AND status IN ('planned', 'running') ORDER BY created_at DESC LIMIT 1", agentId);
  if (!row) return null;
  const steps = await db.all('SELECT * FROM strategy_execution_steps WHERE run_id = ? ORDER BY sequence', row.id);
  const previousMetrics = json(row.metrics_json, {});
  const delta = metricDelta(event.payload);
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : Date.now();
  const metrics = {
    tokens: Number(previousMetrics.tokens || 0) + delta.tokens,
    inputTokens: Number(previousMetrics.inputTokens || 0) + delta.inputTokens,
    cachedInputTokens: Number(previousMetrics.cachedInputTokens || 0) + delta.cachedInputTokens,
    outputTokens: Number(previousMetrics.outputTokens || 0) + delta.outputTokens,
    billableTokens: Number(previousMetrics.billableTokens || 0) + delta.billableTokens,
    costUsd: Number((Number(previousMetrics.costUsd || 0) + delta.costUsd).toFixed(6)),
    latencyMs: Math.max(0, Date.now() - startedAt),
    events: Number(previousMetrics.events || 0) + 1
  };
  const budget = json(row.budget_json, DEFAULT_BUDGET);
  const blocked = ['BUDGET_EXHAUSTED', 'AGENT_HALTED'].includes(event.eventType);
  let guardrailReason = policyViolation(event)
    || (blocked ? event.detail || 'execution blocked by runtime guardrail' : null)
    || exceededGuardrail(metrics, budget);
  const failed = ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(event.eventType);
  const completed = ['AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN'].includes(event.eventType);
  const contractRecord = await strategyContracts.getContractById(db, row.contract_id);
  const approvalRequired = completed && contractRecord?.contract?.promotion?.require_human_approval === true;
  const index = stepIndex(event, steps.length);
  const now = new Date().toISOString();
  if (!guardrailReason) guardrailReason = unfinishedPhaseReason(steps, index);

  if (index >= 0 && steps[index]) {
    const step = steps[index];
    let primitiveExec = null;
    if (!guardrailReason && step.status === 'planned') {
      primitiveExec = await executeStepPrimitives(db, agentId, { step, contractId: row.contract_id, context: { ...event.payload, task: event.detail } });
      if (!guardrailReason) guardrailReason = primitiveFailureReason(step, primitiveExec);
    }
    const evidence = json(step.evidence_json, []);
    evidence.push({ eventType: event.eventType, action: event.action, detail: event.detail, timestamp: now });
    if (primitiveExec && Array.isArray(primitiveExec.results) && primitiveExec.results.length) {
      evidence.push({ primitiveResults: primitiveExec.results, success: primitiveExec.success, timestamp: now });
    }
    const stepMetrics = json(step.actual_metrics_json, {});
    await db.run(
      `UPDATE strategy_execution_steps SET status = ?, actual_metrics_json = ?, evidence_json = ?,
       started_at = COALESCE(started_at, ?), completed_at = ? WHERE id = ?`,
      guardrailReason ? 'blocked' : (failed ? 'failed' : (approvalRequired ? 'awaiting_approval' : (completed ? 'completed' : 'running'))),
      JSON.stringify({
        tokens: Number(stepMetrics.tokens || 0) + delta.tokens,
        inputTokens: Number(stepMetrics.inputTokens || 0) + delta.inputTokens,
        cachedInputTokens: Number(stepMetrics.cachedInputTokens || 0) + delta.cachedInputTokens,
        outputTokens: Number(stepMetrics.outputTokens || 0) + delta.outputTokens,
        billableTokens: Number(stepMetrics.billableTokens || 0) + delta.billableTokens,
        costUsd: Number(stepMetrics.costUsd || 0) + delta.costUsd
      }),
      JSON.stringify(evidence.slice(-50)), now, guardrailReason || failed || completed ? now : null, step.id
    );
  }

  let status = row.status === 'planned' ? 'running' : row.status;
  if (guardrailReason) status = 'blocked';
  else if (failed) status = 'failed';
  else if (approvalRequired) status = 'awaiting_approval';
  else if (completed) status = 'completed';
  if (FINAL_EVENTS.has(event.eventType) || guardrailReason) {
    await db.run("UPDATE strategy_execution_steps SET status = 'skipped', completed_at = ? WHERE run_id = ? AND status = 'planned'", now, row.id);
  }
  await db.run(
    `UPDATE strategy_execution_runs SET status = ?, metrics_json = ?, guardrail_reason = ?,
     started_at = COALESCE(started_at, ?), completed_at = ? WHERE id = ?`,
    status, JSON.stringify(metrics), guardrailReason, now,
    ['awaiting_approval', 'completed', 'failed', 'blocked'].includes(status) ? now : null, row.id
  );
  return { run: await getRun(db, row.id), halt: Boolean(guardrailReason), reason: guardrailReason };
}

async function approveRun(db, id) {
  const row = await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', id);
  if (!row) throw new Error(`Execution run ${id} not found`);
  if (row.status !== 'awaiting_approval') throw new Error(`Execution run ${id} is not awaiting approval`);
  const now = new Date().toISOString();
  await db.run("UPDATE strategy_execution_steps SET status = 'completed', completed_at = ? WHERE run_id = ? AND status = 'awaiting_approval'", now, id);
  await db.run("UPDATE strategy_execution_runs SET status = 'completed', completed_at = ? WHERE id = ?", now, id);
  return getRun(db, id);
}

async function getRun(db, id) {
  return hydrateRun(db, await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', id));
}

async function getLatestRun(db, agentId) {
  return hydrateRun(db, await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1', agentId));
}

async function listRuns(db, agentId, requestedLimit = MAX_RUN_LIST_LIMIT) {
  const limit = Math.max(1, Math.min(MAX_RUN_LIST_LIMIT, Math.floor(Number(requestedLimit) || MAX_RUN_LIST_LIMIT)));
  const rows = await db.all('SELECT * FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?', agentId, limit);
  return Promise.all(rows.map((row) => hydrateRun(db, row)));
}

module.exports = {
  createExecutionRun,
  hydrateRun,
  recordExecutionEvent,
  executeStepPrimitives,
  executePipelineWithFeedback: (primitives, context) => require('./strategyExecutionAdapter').executePipelineWithFeedback(primitives, context),
  executePrimitive: (primitive, context) => require('./strategyExecutionAdapter').executePrimitive(primitive, context),
  approveRun,
  getRun,
  getLatestRun,
  listRuns,
  MAX_RUN_LIST_LIMIT,
  parseRun,
  compileExecutionPlan,
  metricDelta,
  normalizedBudget,
  unfinishedPhaseReason,
  primitiveFailureReason,
  get strategyExecutionAdapter() { return require('./strategyExecutionAdapter'); }
};
