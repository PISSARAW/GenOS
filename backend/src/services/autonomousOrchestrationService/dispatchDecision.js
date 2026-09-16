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

function buildDispatchDecision(workers, dispatchWorkers) {
  if (dispatchWorkers.length) {
    return { status: 'planned', requestedWorkers: workers.length, selectedWorkers: dispatchWorkers.length, reason: 'budget_and_capacity_satisfied' };
  }
  if (workers.length) {
    return { status: 'deferred', requestedWorkers: workers.length, selectedWorkers: 0, reason: 'worker_budget_below_minimum' };
  }
  return { status: 'not_required', requestedWorkers: 0, selectedWorkers: 0, reason: 'no_worker_assignments' };
}

module.exports = { buildExploration, buildDispatchDecision };