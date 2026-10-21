const { buildAllocation } = require('../tokenAllocationService');
const policy = require('../workerTokenBudgetPolicy');

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

function affordablePrefix(envelope, workerBudgets) {
  if (!envelope.valid) return 0;
  let funded = 0;
  for (const [index, workerBudget] of workerBudgets.entries()) {
    funded += workerBudget.minimumStartTokens;
    if (funded > envelope.workerPool) return index;
  }
  return workerBudgets.length;
}

function admissionFor(input) {
  const { atomic, fundedCount, workers, envelope, workerBudgets, budget } = input;
  const required = policy.sumField(workerBudgets, 'minimumStartTokens');
  return { atomic, valid: envelope.valid && (!atomic || fundedCount === workers.length),
    requestedWorkers: workers.length, fundedWorkers: fundedCount,
    availableWorkerTokens: envelope.workerPool, requiredWorkerTokens: required,
    shortfallTokens: Math.max(0, required - envelope.workerPool),
    minimumAcceptableTotal: policy.minimumAcceptableTotal(workerBudgets, budget),
    reason: envelope.invalidReason || (fundedCount < workers.length
      ? 'worker_budget_below_role_minimum' : null) };
}

function buildTokenPlan(budget, flags, workers) {
  const totalTokens = resolveTotalTokens(budget, workers.length);
  const minimumWorkerTokens = resolveMinimumWorkerTokens(budget, workers.length);
  const override = budget.minimumWorkerTokens ?? tokenPolicyValue(budget, 'minimumWorkerTokens');
  const workerBudgets = policy.profileWorkers(workers, override);
  const envelope = policy.budgetEnvelope(totalTokens, workerBudgets, budget);
  const atomic = flags.security || budget.atomicTopology === true;
  const affordableWorkers = affordablePrefix(envelope, workerBudgets);
  const fundedCount = atomic && affordableWorkers !== workers.length ? 0 : affordableWorkers;
  const dispatchWorkers = workers.slice(0, fundedCount);
  const selectedBudgets = workerBudgets.slice(0, fundedCount);
  const allocation = flags.complex || flags.uncertain ? 'successive_halving_with_reallocation' : 'equal_minimum_then_score_weighted';
  const rounds = buildAllocation({
    totalTokens, workerShare: envelope.workerShare, workerCount: dispatchWorkers.length,
    minimumWorkerTokens, workerBudgets: selectedBudgets, mode: allocation
  });
  const admission = admissionFor({ atomic, fundedCount, workers, envelope, workerBudgets, budget });
  return { totalTokens, minimumWorkerTokens, minimumWorkerTokensExplicit: override != null,
    workerBudgets, effectiveWorkerShare: envelope.workerShare,
    orchestratorReserve: envelope.orchestratorReserve,
    orchestratorReserveTokens: envelope.orchestratorReserveTokens,
    minimumOrchestratorReserveTokens: envelope.minimumOrchestratorReserveTokens,
    explicitWorkerShare: envelope.explicitWorkerShare,
    dispatchWorkers, allocation, rounds, admission };
}

module.exports = { buildTokenPlan, resolveTotalTokens, resolveMinimumWorkerTokens };
