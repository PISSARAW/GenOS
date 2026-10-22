'use strict';

function availableBudget(session) {
  const raw = session.budgets?.growth ?? session.budgets?.default ?? 0;
  let value = raw;
  const growthReserve = session.variantPolicy?.growth?.growthReserveRatio;
  if (Number.isFinite(growthReserve) && growthReserve > 0 && growthReserve < 1) {
    value *= (1 - growthReserve);
  }
  const recoveryReserve = session.variantPolicy?.resilience?.recoveryReserveRatio;
  if (Number.isFinite(recoveryReserve) && recoveryReserve > 0 && recoveryReserve < 1) {
    value *= (1 - recoveryReserve);
  }
  return value;
}

function fitsBudget(session, candidate) {
  return candidate.creationCost + candidate.coordinationCost <= availableBudget(session);
}

module.exports = { availableBudget, fitsBudget };
