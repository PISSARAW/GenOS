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

function inheritCommunicationPolicy(workers, budget) {
  return workers.map(worker => ({
    ...worker,
    communicationRequired: worker.communicationRequired === true || budget.communicationRequired === true,
    coordinationPolicy: worker.coordinationPolicy || budget.coordinationPolicy
  }));
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
  const runtimeCeilingFailures = workerBudgets.filter(profile => profile.runtimeCeilingExceeded);
  return { atomic, valid: envelope.valid && runtimeCeilingFailures.length === 0
      && (!atomic || fundedCount === workers.length),
    requestedWorkers: workers.length, fundedWorkers: fundedCount,
    availableWorkerTokens: envelope.workerPool, requiredWorkerTokens: required,
    shortfallTokens: Math.max(0, required - envelope.workerPool),
    minimumAcceptableTotal: runtimeCeilingFailures.length === 0
      ? policy.minimumAcceptableTotal(workerBudgets, budget) : null,
    runtimeCeilingFailures: runtimeCeilingFailures.map(profile => ({
      workerKind: profile.workerKind, role: profile.role,
      requestedMinimumTokens: profile.minimumStartTokens,
      runtimeMaximumTokens: profile.runtimeMaximumTokens
    })),
    reason: envelope.invalidReason || (runtimeCeilingFailures.length > 0
      ? 'worker_minimum_exceeds_runtime_ceiling' : fundedCount < workers.length
      ? 'worker_budget_below_role_minimum' : null) };
}

function buildTokenPlan(budget, flags, workers) {
  const totalTokens = resolveTotalTokens(budget, workers.length);
  const minimumWorkerTokens = resolveMinimumWorkerTokens(budget, workers.length);
  const override = budget.minimumWorkerTokens ?? tokenPolicyValue(budget, 'minimumWorkerTokens');
  const workerBudgets = policy.profileWorkers(inheritCommunicationPolicy(workers, budget), override);
  const envelope = policy.budgetEnvelope(totalTokens, workerBudgets, budget);
  const atomic = flags.security || budget.atomicTopology === true;
  const affordableWorkers = affordablePrefix(envelope, workerBudgets);
  const hasRuntimeCeilingFailure = workerBudgets.some(profile => profile.runtimeCeilingExceeded);
  const fundedCount = hasRuntimeCeilingFailure || (atomic && affordableWorkers !== workers.length)
    ? 0 : affordableWorkers;
  const dispatchWorkers = workers.slice(0, fundedCount);
  const selectedBudgets = workerBudgets.slice(0, fundedCount);
  const allocation = budget.morphogenesisPolicy?.adaptive === true || flags.complex || flags.uncertain
    ? 'successive_halving_with_reallocation' : 'equal_minimum_then_score_weighted';
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
