'use strict';

// 1.5 = marge de 50 % au-dessus du budget global. Absorbe les pics de demande
// transitoires sans refuser immédiatement les contrats, tout en conservant une
// borne dure qui empêche la sur-allocation unbounded (1,2 trop serré, 2,0 trop
// permisif). Valeur par défaut révisable via overcommitRatio.
const DEFAULT_OVERCOMMIT_RATIO = 1.5;

function budgetOf(contract) {
  const value = contract && contract.resourceModel && contract.resourceModel.budget;
  return Number.isFinite(value) ? Number(value) : 0;
}

function check(contracts, globalBudget, overcommitRatio = DEFAULT_OVERCOMMIT_RATIO) {
  const ratio = Number(overcommitRatio) || DEFAULT_OVERCOMMIT_RATIO;
  const limit = Number(globalBudget) * ratio;
  let total = 0;
  for (const contract of contracts) {
    total += budgetOf(contract);
  }
  if (!Number.isFinite(globalBudget) || total > limit) {
    return { valid: false, reason: `resource budget ${total} exceeds limit ${limit}` };
  }
  return { valid: true };
}

module.exports = { check };
