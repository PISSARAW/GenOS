/**
 * Strategy execution reads, metrics and step primitives (extraction of
 * strategyExecutionService). Run-progress persistence lives in
 * strategyExecutionProgress. Only lazy cross-module requires are used.
 */

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

const DEFAULT_BUDGET = Object.freeze({ tokens: 500000, costUsd: 5, latencyMs: 30 * 60 * 1000, events: 500 });
const MAX_RUN_LIST_LIMIT = 100;
const FINAL_EVENTS = new Set([
  'AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN',
  'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED',
  'BUDGET_EXHAUSTED', 'AGENT_HALTED'
]);

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function parseRun(row, steps) {
  if (!row) return null;
  const parsedSteps = steps.map((step) => ({
    id: step.id, sequence: step.sequence, stageKey: step.stage_key, status: step.status,
    strategyIds: safeJson(step.strategy_ids_json, []), plannedBudget: safeJson(step.planned_budget_json, {}),
    actualMetrics: safeJson(step.actual_metrics_json, {}), evidence: safeJson(step.evidence_json, []),
    startedAt: step.started_at, completedAt: step.completed_at
  }));
  const completed = parsedSteps.filter((step) => step.status === 'completed').length;
  const observed = parsedSteps.filter((step) => !['planned', 'skipped'].includes(step.status)).length;
  return {
    id: row.id, agentId: row.agent_id, contractId: row.contract_id, contractVersion: row.contract_version,
    status: row.status, budget: safeJson(row.budget_json, {}), metrics: safeJson(row.metrics_json, {}),
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

async function getRun(db, id) {
  return hydrateRun(db, await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', id));
}

async function getLatestRun(db, agentId) {
  return hydrateRun(db, await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1', agentId));
}

async function listRuns(db, agentId, requestedLimit) {
  const wanted = requestedLimit === undefined ? MAX_RUN_LIST_LIMIT : requestedLimit;
  const limit = Math.max(1, Math.min(MAX_RUN_LIST_LIMIT, Math.floor(Number(wanted) || MAX_RUN_LIST_LIMIT)));
  const rows = await db.all('SELECT * FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?', agentId, limit);
  return Promise.all(rows.map((row) => hydrateRun(db, row)));
}

function resolveStagePrimitives(stageKey, portfolio, options) {
  const list = portfolio || [];
  const settings = options || {};
  const defaults = STAGE_PRIMITIVE_MAP[stageKey] || [];
  const portfolioPrimitives = list.flatMap((entry) => entry.primitives || []);
  const matching = portfolioPrimitives.filter((primitive) => defaults.includes(primitive));
  if (settings.strict && matching.length === 0 && defaults.length > 0) {
    throw Object.assign(
      new Error(`Stage '${stageKey}' requires one of [${defaults.join(', ')}] but the selected strategy portfolio does not support any. Portfolio primitives: [${portfolioPrimitives.join(', ') || 'none'}]`),
      { code: 'STRATEGY_PORTFOLIO_UNSUPPORTED_STAGE', stageKey, required: defaults, available: portfolioPrimitives }
    );
  }
  return [...new Set(matching)];
}

function eventUsage(payload) {
  const source = payload || {};
  if (source.usage) return source.usage;
  if (source.item && source.item.usage) return source.item.usage;
  return {};
}

function usageTokenCounts(usage) {
  const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0);
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, Number(usage.cached_input_tokens || usage.cache_read_input_tokens || 0)));
  return { inputTokens, outputTokens, cachedInputTokens };
}

function usageContextTokens(source, usage, counts) {
  return Number(source.tokens || usage.total_tokens || (counts.inputTokens + counts.outputTokens) || 0);
}

function usageCostUsd(source, usage) {
  return Number(source.costUsd || source.cost_usd || usage.cost_usd || 0);
}

function metricDelta(payload) {
  const source = payload || {};
  const usage = eventUsage(source);
  const counts = usageTokenCounts(usage);
  return {
    tokens: usageContextTokens(source, usage, counts),
    inputTokens: counts.inputTokens,
    cachedInputTokens: counts.cachedInputTokens,
    outputTokens: counts.outputTokens,
    billableTokens: Math.max(0, counts.inputTokens - counts.cachedInputTokens) + counts.outputTokens,
    costUsd: usageCostUsd(source, usage)
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
  const current = steps[index] ? steps[index].stage_key : undefined;
  if (!unfinished.length) return null;
  return `Cannot enter '${current}' before completing: ${unfinished.map((step) => step.stage_key).join(', ')}.`;
}

function primitiveFailureReason(step, result) {
  if (!result || result.success !== false) return null;
  return `Phase '${step.stage_key}' gate failed: ${result.error || 'strategy primitive failed.'}.`;
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

function stepExecContext(agentId, context) {
  const extra = context || {};
  return { agentId, orchestratorId: agentId, workspaceId: extra.workspaceId, task: extra.task || extra.detail, ...extra };
}

async function executeStepPrimitives(db, agentId, options) {
  const entry = options || {};
  if (!entry.step) return { success: true, results: [] };
  try {
    const contractRow = entry.contractId
      ? await db.get('SELECT contract_json FROM strategy_contracts WHERE id = ?', entry.contractId)
      : await db.get(
        'SELECT contract_json FROM strategy_contracts WHERE agent_id = ? AND status = "active" ORDER BY version DESC LIMIT 1',
        agentId
      );
    const row = contractRow || {};
    const contract = safeJson(row.contract_json, {});
    const step = entry.step;
    const stageKey = step.stage_key || step.stageKey || '';
    const primitives = resolveStagePrimitives(stageKey, contract.strategy_portfolio);
    if (!primitives.length) return { success: true, results: [] };
    const adapter = require('./strategyExecutionAdapter');
    return await adapter.executePipelineWithFeedback(primitives, stepExecContext(agentId, entry.context));
  } catch (error) {
    return { success: false, error: error.message, results: [] };
  }
}

module.exports = {
  DEFAULT_BUDGET,
  MAX_RUN_LIST_LIMIT,
  FINAL_EVENTS,
  STAGE_PRIMITIVE_MAP,
  safeJson,
  parseRun,
  hydrateRun,
  getRun,
  getLatestRun,
  listRuns,
  resolveStagePrimitives,
  metricDelta,
  stepIndex,
  unfinishedPhaseReason,
  primitiveFailureReason,
  exceededGuardrail,
  policyViolation,
  executeStepPrimitives
};
