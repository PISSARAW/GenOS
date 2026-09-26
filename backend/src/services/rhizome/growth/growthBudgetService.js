'use strict';

function availableBudget(session) {
  const raw = session.budgets?.growth ?? session.budgets?.default ?? 0;
  const reserve = session.variantPolicy?.growth?.growthReserveRatio;
  if (Number.isFinite(reserve) && reserve > 0 && reserve < 1) {
    return raw * (1 - reserve);
  }
  return raw;
}

function fitsBudget(session, candidate) {
  return candidate.creationCost + candidate.coordinationCost <= availableBudget(session);
}

module.exports = { availableBudget, fitsBudget };
