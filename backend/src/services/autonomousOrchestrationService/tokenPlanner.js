const { buildAllocation } = require('../tokenAllocationService');

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function resolveShare(value, fallback) {
  return Number.isFinite(Number(value)) ? clampUnit(Number(value)) : fallback;
}

function tokenPolicyValue(budget, key) {
  return (budget.tokenPolicy || {})[key];
}

function resolveTotalTokens(budget, workerCount) {
  const fallback = workerCount > 10 ? Math.max(500000, workerCount * 20000) : 500000;
  return Number(budget.tokens ?? fallback);
}

function resolveMinimumWorkerTokens(budget, workerCount) {
  const fallback = workerCount > 10 ? 1000 : 8000;
  return Number(budget.minimumWorkerTokens ?? fallback);
}

function buildTokenPlan(budget, flags, workers) {
  const totalTokens = resolveTotalTokens(budget, workers.length);
  const minimumWorkerTokens = resolveMinimumWorkerTokens(budget, workers.length);
  const workerShare = resolveShare(budget.workerShare, resolveShare(tokenPolicyValue(budget, 'workerShare'), 0.6));
  const orchestratorReserve = resolveShare(budget.orchestratorReserve, resolveShare(tokenPolicyValue(budget, 'orchestratorReserve'), 1 - workerShare));
  const minimumViableWorkerShare = workers.length && totalTokens >= minimumWorkerTokens ? minimumWorkerTokens / totalTokens : workerShare;
  const effectiveWorkerShare = Math.max(workerShare, minimumViableWorkerShare);
  const affordableWorkers = Math.max(0, Math.floor((totalTokens * effectiveWorkerShare) / minimumWorkerTokens));
  const dispatchWorkers = workers.slice(0, Math.min(workers.length, affordableWorkers));
  const effectiveOrchestratorReserve = dispatchWorkers.length
    ? Math.min(orchestratorReserve, 1 - effectiveWorkerShare)
    : 1;
  const allocation = flags.complex || flags.uncertain ? 'successive_halving_with_reallocation' : 'equal_minimum_then_score_weighted';
  const rounds = buildAllocation({
    totalTokens, workerShare: dispatchWorkers.length ? effectiveWorkerShare : 0, workerCount: dispatchWorkers.length,
    minimumWorkerTokens, mode: allocation
  });
  return { totalTokens, minimumWorkerTokens, effectiveWorkerShare,
    orchestratorReserve: effectiveOrchestratorReserve, dispatchWorkers, allocation, rounds };
}

module.exports = { buildTokenPlan, resolveTotalTokens, resolveMinimumWorkerTokens };
