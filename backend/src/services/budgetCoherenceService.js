function coalesce(primary, fallback) {
  return primary != null ? primary : fallback;
}

function parsePositiveNumber(value, fallback, label) {
  if (value !== undefined && value !== null && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
    throw Object.assign(new Error(`Budget ${label} must be finite and strictly positive.`), { code: 'INVALID_BUDGET_VALUE', value, label });
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    if (process.env.GENOS_DEBUG_BUDGET !== '0') {
      console.warn(`[BudgetCoherence] Budget ${label} is missing or invalid (${value}), using default: ${fallback}`);
    }
    return fallback;
  }
  return num;
}

function clampShare(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function resolveShares({ workerShare, reserve, fallbackWorker, fallbackReserve }) {
  if (workerShare !== undefined && reserve !== undefined) {
    return [Number(workerShare), Number(reserve)];
  }
  if (workerShare !== undefined) {
    const share = Number(workerShare);
    return [share, Number.isFinite(share) ? 1.0 - share : fallbackReserve];
  }
  if (reserve !== undefined) {
    const res = Number(reserve);
    return [Number.isFinite(res) ? 1.0 - res : fallbackWorker, res];
  }
  return [fallbackWorker, fallbackReserve];
}

function readRoundsPool(rounds, key) {
  const round = rounds[key];
  if (round == null) {
    return 0;
  }
  return Number(coalesce(round.pool, 0));
}

function normalizeMissionBudget(raw = {}) {
  const executionBudget = raw.executionBudget || raw;
  const tokens = parsePositiveNumber(coalesce(executionBudget.tokens, raw.tokens), 100000);
  const costUsd = parsePositiveNumber(coalesce(executionBudget.costUsd, raw.costUsd), 1.0);
  const latencyMs = parsePositiveNumber(coalesce(executionBudget.latencyMs, raw.latencyMs), 60000);
  const events = parsePositiveNumber(coalesce(executionBudget.events, raw.events), 100);
  const shares = resolveShares({
    workerShare: coalesce(executionBudget.workerShare, raw.workerShare),
    reserve: coalesce(executionBudget.orchestratorReserve, raw.orchestratorReserve),
    fallbackWorker: 0.6,
    fallbackReserve: 0.4
  });
  return {
    tokens,
    costUsd,
    latencyMs,
    events,
    workerShare: clampShare(shares[0], 0.6),
    orchestratorReserve: clampShare(shares[1], 0.4)
  };
}

function validateOrchestratorScope(normalized, total, expectedOrchestratorBudget) {
  if (normalized.tokens > total) {
    return `orchestrator runtime budget ${normalized.tokens} exceeds total mission budget ${total}`;
  }
  if (normalized.tokens > Math.ceil(expectedOrchestratorBudget) + 1) {
    return `orchestrator runtime budget ${normalized.tokens} exceeds orchestrator reserve ${expectedOrchestratorBudget}`;
  }
  return null;
}

function validateWorkerScope(normalized, total) {
  if (normalized.tokens > total) {
    return `worker runtime budget ${normalized.tokens} exceeds total mission budget ${total}`;
  }
  return null;
}

function validateMissionScope(normalized, total) {
  if (normalized.tokens > 0 && total > normalized.tokens) {
    return `runtime budget ${normalized.tokens} is smaller than autonomy budget ${total}`;
  }
  return null;
}

function validateScopeBudgets({ activeScope, normalized, total, expectedOrchestratorBudget }) {
  if (activeScope === 'orchestrator') {
    return validateOrchestratorScope(normalized, total, expectedOrchestratorBudget);
  }
  if (activeScope === 'worker') {
    return validateWorkerScope(normalized, total);
  }
  return validateMissionScope(normalized, total);
}

function validateBudgetCoherence({ executionBudget = {}, autonomyPlan = {}, scope = 'mission' } = {}) {
  const normalized = normalizeMissionBudget(executionBudget);
  const tokenPolicy = autonomyPlan.tokenPolicy || {};
  const total = Number(coalesce(tokenPolicy.total, coalesce(normalized.tokens, 0)));
  const shares = resolveShares({
    workerShare: tokenPolicy.workerShare,
    reserve: tokenPolicy.orchestratorReserve,
    fallbackWorker: normalized.workerShare,
    fallbackReserve: normalized.orchestratorReserve
  });
  const rounds = tokenPolicy.rounds || {};
  const totalDispatched = readRoundsPool(rounds, 'initial') + readRoundsPool(rounds, 'continuation');

  if (total <= 0) {
    return { valid: false, reason: 'budget total must be positive' };
  }

  const expectedWorkerBudget = total * shares[0];
  const expectedOrchestratorBudget = total * shares[1];
  if (totalDispatched > total) {
    return { valid: false, reason: `budget envelope exceeded: dispatched ${totalDispatched} > total ${total}` };
  }
  if (Math.abs(expectedWorkerBudget + expectedOrchestratorBudget - total) > 0.001) {
    return { valid: false, reason: `worker/orchestrator split is inconsistent with total budget: ${expectedWorkerBudget} + ${expectedOrchestratorBudget} != ${total}` };
  }

  const activeScope = executionBudget.scope || scope;
  const scopeError = validateScopeBudgets({ activeScope, normalized, total, expectedOrchestratorBudget });
  if (scopeError) {
    return { valid: false, reason: scopeError };
  }

  return { valid: true, normalized, total, workerShare: shares[0], orchestratorReserve: shares[1] };
}

module.exports = {
  normalizeMissionBudget,
  validateBudgetCoherence
};
