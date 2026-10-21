function buildExploration(workers, dispatchWorkers) {
  return {
    requestedBranches: workers.length,
    selectedBranches: dispatchWorkers.length,
    available: dispatchWorkers.length > 1,
    reason: dispatchWorkers.length > 1
      ? 'multiple_workers_budgeted'
      : workers.length
        ? 'budget_or_capacity_allows_at_most_one_worker'
        : 'no_independent_branches_declared'
  };
}

function buildDispatchDecision(workers, dispatchWorkers, admission) {
  if (dispatchWorkers.length) {
    return { status: 'planned', requestedWorkers: workers.length, selectedWorkers: dispatchWorkers.length,
      reason: dispatchWorkers.length === workers.length ? 'budget_and_capacity_satisfied' : 'partial_topology_budgeted',
      ...(admission ? { admission } : {}) };
  }
  if (workers.length) {
    return { status: 'deferred', code: 'TOPOLOGY_BUDGET_INSUFFICIENT',
      requestedWorkers: workers.length, selectedWorkers: 0,
      reason: admission?.reason || 'worker_budget_below_minimum',
      ...(admission ? { admission } : {}) };
  }
  return { status: 'not_required', requestedWorkers: 0, selectedWorkers: 0, reason: 'no_worker_assignments' };
}

module.exports = { buildExploration, buildDispatchDecision };
