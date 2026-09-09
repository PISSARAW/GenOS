const { getDatabase } = require('../../db');
const strategyContracts = require('./strategyContractService');
const { json } = require('./strategyExecutionService');

const FINAL_EVENTS = new Set([
  'AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN',
  'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED',
  'BUDGET_EXHAUSTED', 'AGENT_HALTED'
]);

function isFinalEvent(eventType) {
  return FINAL_EVENTS.has(eventType);
}

function isBlockedEvent(eventType) {
  return ['BUDGET_EXHAUSTED', 'AGENT_HALTED'].includes(eventType);
}

function isFailedEvent(eventType) {
  return ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(eventType);
}

function isCompletedEvent(eventType) {
  return ['AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN'].includes(eventType);
}

function getPolicyViolation(event) {
  if (event.eventType === 'HARD_INVARIANT_FAILURE') return 'hard invariant failure';
  if (event.eventType === 'CIRCUIT_BREAKER_OPEN') return 'circuit breaker opened';
  return null;
}

async function getExecutionRunRow(db, executionRunId, agentId) {
  if (executionRunId) {
    return await db.get("SELECT * FROM strategy_execution_runs WHERE id = ? AND agent_id = ? AND status IN ('planned', 'running')", executionRunId, agentId);
  }
  return await db.get("SELECT * FROM strategy_execution_runs WHERE agent_id = ? AND status IN ('planned', 'running') ORDER BY created_at DESC LIMIT 1", agentId);
}

function calculateMetrics(previousMetrics, delta) {
  return {
    tokens: Number(previousMetrics.tokens || 0) + delta.tokens,
    inputTokens: Number(previousMetrics.inputTokens || 0) + delta.inputTokens,
    cachedInputTokens: Number(previousMetrics.cachedInputTokens || 0) + delta.cachedInputTokens,
    outputTokens: Number(previousMetrics.outputTokens || 0) + delta.outputTokens,
    billableTokens: Number(previousMetrics.billableTokens || 0) + delta.billableTokens,
    costUsd: Number((Number(previousMetrics.costUsd || 0) + delta.costUsd).toFixed(6)),
    latencyMs: Math.max(0, Date.now() - (previousMetrics.startedAt || Date.now())),
    events: Number(previousMetrics.events || 0) + 1
  };
}

function determineGuardrailReason(..._args) {
  const [policyViolationResult, blocked, eventDetail, exceededResult] = _args;

  return policyViolationResult
    || (blocked ? eventDetail || 'execution blocked by runtime guardrail' : null)
    || exceededResult;
}

async function getContractRecord(db, row) {
  return await strategyContracts.getContractById(db, row.contract_id);
}

function determineStatus(..._args) {
  const [row, guardrailReason, failed, approvalRequired, completed] = _args;

  let status = row.status === 'planned' ? 'running' : row.status;
  if (guardrailReason) status = 'blocked';
  else if (failed) status = 'failed';
  else if (approvalRequired) status = 'awaiting_approval';
  else if (completed) status = 'completed';
  return status;
}

function getStepStatus(..._args) {
  const [guardrailReason, failed, approvalRequired, completed] = _args;

  if (guardrailReason) return 'blocked';
  if (failed) return 'failed';
  if (approvalRequired) return 'awaiting_approval';
  if (completed) return 'completed';
  return 'running';
}

async function handleFallbackStrategy(..._args) {
  const [db, agentId, guardrailReason, failed] = _args;

  if (failed || guardrailReason) {
    try {
      return await require('./strategyAdaptationService').useFallbackStrategyIfPrimaryFailed(db, agentId);
    } catch (error) {
      return { changed: false, error: error.message };
    }
  }
  return null;
}

module.exports = {
  isFinalEvent, isBlockedEvent, isFailedEvent, isCompletedEvent,
  getPolicyViolation, getExecutionRunRow, calculateMetrics,
  determineGuardrailReason, getContractRecord, determineStatus,
  getStepStatus, handleFallbackStrategy
};
