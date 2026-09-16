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
const SETTLED_STEP_STATUSES = new Set(['completed', 'skipped']);

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function epistemicState(row, parsedSteps) {
  if (!row) return { verdict: 'unknown', reason: 'missing run row', promotable: false };
  if (row.status === 'completed') return { verdict: 'verified', reason: 'execution completed without guardrail', promotable: true };
  if (row.status === 'awaiting_approval') return { verdict: 'pending_approval', reason: 'human approval proof is required', promotable: false };
  if (row.status === 'blocked') return { verdict: 'blocked', reason: row.guardrail_reason || 'runtime guardrail blocked execution', promotable: false };
  if (row.status === 'failed' || row.status === 'cancelled') return { verdict: 'failed', reason: row.guardrail_reason || `execution ${row.status}`, promotable: false };
  const touched = parsedSteps.some((step) => !['planned', 'skipped'].includes(step.status));
  return { verdict: touched ? 'in_progress' : 'unverified', reason: touched ? 'execution has started' : 'no execution evidence recorded', promotable: false };
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
    epistemicState: epistemicState(row, parsedSteps),
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
  const last = stepCount - 1;
  const byType = { AGENT_RUNTIME_STARTED: 0, AGENT_PLAN_CREATED: 1, AGENT_COMPLETED: last, AGENT_STEP: 3 };
  const byAction = { THINK: 2, VERIFY: 5 };
  const index = byType[event.eventType] ?? byAction[event.action];
  return index === undefined ? -1 : Math.min(index, last);
}

function isUnsettledPredecessor(step, index) {
  if (step.sequence >= index) return false;
  return !SETTLED_STEP_STATUSES.has(step.status);
}

function unfinishedPhaseReason(steps, index) {
  if (index <= 0) return null;
  const unfinished = [];
  for (const step of steps) {
    if (isUnsettledPredecessor(step, index)) unfinished.push(step);
  }
  const current = steps[index] ? steps[index].stage_key : undefined;
  if (!unfinished.length) return null;
  const names = unfinished.map(stepStageKey).join(', ');
  return `Cannot enter '${current}' before completing: ${names}.`;
}

function stepStageKey(step) {
  return step.stage_key;
}

function primitiveFailureReason(step, result) {
  if (!result || result.success !== false) return null;
  // The pipeline wrapper ({ success, results }) carries no `error` of its own:
  // the real cause lives in the first failed primitive result.
  const failed = Array.isArray(result.results)
    ? result.results.find((entry) => entry && entry.result && entry.result.success === false)
    : null;
  const detail = result.error
    || (failed && (failed.result.error || failed.result.code))
    || (failed && failed.primitive)
    || 'strategy primitive failed';
  const message = `Phase '${step.stage_key}' gate failed: ${detail}`;
  return message.endsWith('.') ? message : `${message}.`;
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

// Some strategy primitives cannot run from a coarse runtime lifecycle event
// alone: they need explicit invocation inputs (a tool, a patch, a workspace).
// The lifecycle event that drives a phase carries none of those. When the inputs
// are absent the phase is "not applicable" and must be skipped, never halted:
// only a primitive that actually attempted work and failed can stop a mission.
const PRIMITIVE_CONTEXT_REQUIREMENTS = {
  vfs_dry_run: ['workspaceId', 'patch'],
  blast_radius: ['workspaceId', 'patch'],
  run: ['tool'],
  safe_revert: ['workspaceId', 'snapshotId'],
  restore: ['workspaceId', 'snapshotId'],
  causal_replay_intervention: ['inputFile'],
  intervene: ['inputFile'],
  causal_replay: ['inputFile'],
  replay: ['inputFile'],
  golden_path_replay: ['inputFile'],
  counterfactual_replay: ['inputFile'],
  causal_rebase: ['graphFile'],
  inject_change: ['graphFile'],
  replay_dependencies: ['nodeId']
};

function missingContext(primitive, context = {}) {
  const required = PRIMITIVE_CONTEXT_REQUIREMENTS[primitive];
  if (!required) return [];
  return required.filter((key) => context[key] === undefined || context[key] === null || context[key] === '');
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
    const context = stepExecContext(agentId, entry.context);
    const primitives = resolveStagePrimitives(stageKey, contract.strategy_portfolio);
    const executable = primitives.filter((primitive) => missingContext(primitive, context).length === 0);
    const notApplicable = primitives.filter((primitive) => missingContext(primitive, context).length > 0);
    if (!executable.length) {
      return { success: true, applicable: false, results: [], notApplicable };
    }
    const adapter = require('./strategyExecutionAdapter');
    const pipeline = await adapter.executePipelineWithFeedback(executable, context);
    return { ...pipeline, applicable: true, notApplicable };
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
  PRIMITIVE_CONTEXT_REQUIREMENTS,
  missingContext,
  metricDelta,
  stepIndex,
  unfinishedPhaseReason,
  primitiveFailureReason,
  exceededGuardrail,
  policyViolation,
  executeStepPrimitives
};
