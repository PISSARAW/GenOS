'use strict';

function availableBudget(session) {
  return session.budgets?.growth ?? session.budgets?.default ?? 0;
}

function fitsBudget(session, candidate) {
  return candidate.creationCost + candidate.coordinationCost <= availableBudget(session);
}

module.exports = { availableBudget, fitsBudget };
