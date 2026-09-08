function normalizeMissionBudget(raw = {}) {
  const executionBudget = raw.executionBudget || raw;
  const rawTokens = Number(executionBudget.tokens ?? raw.tokens);
  const tokens = Number.isFinite(rawTokens) && rawTokens > 0 ? rawTokens : 100000;
  const rawCost = Number(executionBudget.costUsd ?? raw.costUsd);
  const costUsd = Number.isFinite(rawCost) && rawCost > 0 ? rawCost : 1.0;
  const rawLatency = Number(executionBudget.latencyMs ?? raw.latencyMs);
  const latencyMs = Number.isFinite(rawLatency) && rawLatency > 0 ? rawLatency : 60000;
  const rawEvents = Number(executionBudget.events ?? raw.events);
  const events = Number.isFinite(rawEvents) && rawEvents > 0 ? rawEvents : 100;
  const workerShare = Number(executionBudget.workerShare ?? raw.workerShare ?? 0.6);
  const orchestratorReserve = Number(executionBudget.orchestratorReserve ?? raw.orchestratorReserve ?? 0.4);

  return {
    tokens,
    costUsd,
    latencyMs,
    events,
    workerShare: Number.isFinite(workerShare) ? Math.max(0, Math.min(1, workerShare)) : 0.6,
    orchestratorReserve: Number.isFinite(orchestratorReserve) ? Math.max(0, Math.min(1, orchestratorReserve)) : 0.4
  };
}

function validateBudgetCoherence({ executionBudget = {}, autonomyPlan = {}, scope = 'mission' } = {}) {
  const normalized = normalizeMissionBudget(executionBudget);
  const tokenPolicy = autonomyPlan.tokenPolicy || {};
  const total = Number(tokenPolicy.total ?? normalized.tokens ?? 0);
  const workerShare = Number(tokenPolicy.workerShare ?? normalized.workerShare ?? 0.6);
  const orchestratorReserve = Number(tokenPolicy.orchestratorReserve ?? normalized.orchestratorReserve ?? 0.4);
  const rounds = tokenPolicy.rounds || {};
  const initialPool = Number(rounds.initial?.pool ?? 0);
  const continuationPool = Number(rounds.continuation?.pool ?? 0);
  const totalDispatched = initialPool + continuationPool;

  if (total <= 0) {
    return { valid: false, reason: 'budget total must be positive' };
  }

  const expectedWorkerBudget = total * workerShare;
  const expectedOrchestratorBudget = total * orchestratorReserve;
  if (totalDispatched > total) {
    return { valid: false, reason: `budget envelope exceeded: dispatched ${totalDispatched} > total ${total}` };
  }
  if (Math.abs(expectedWorkerBudget + expectedOrchestratorBudget - total) > 0.001) {
    return { valid: false, reason: `worker/orchestrator split is inconsistent with total budget: ${expectedWorkerBudget} + ${expectedOrchestratorBudget} != ${total}` };
  }
  // Role-specific check:
  const activeScope = executionBudget.scope || scope;
  if (activeScope === 'orchestrator') {
    if (normalized.tokens > total) {
      return { valid: false, reason: `orchestrator runtime budget ${normalized.tokens} exceeds total mission budget ${total}` };
    }
    if (normalized.tokens > Math.ceil(expectedOrchestratorBudget) + 1) {
      return { valid: false, reason: `orchestrator runtime budget ${normalized.tokens} exceeds orchestrator reserve ${expectedOrchestratorBudget}` };
    }
  } else if (activeScope === 'worker') {
    if (normalized.tokens > total) {
      return { valid: false, reason: `worker runtime budget ${normalized.tokens} exceeds total mission budget ${total}` };
    }
  } else {
    // Mission envelope validation
    if (normalized.tokens > 0 && total > normalized.tokens) {
      return { valid: false, reason: `runtime budget ${normalized.tokens} is smaller than autonomy budget ${total}` };
    }
  }

  return { valid: true, normalized, total, workerShare, orchestratorReserve };
}

module.exports = {
  normalizeMissionBudget,
  validateBudgetCoherence
};
