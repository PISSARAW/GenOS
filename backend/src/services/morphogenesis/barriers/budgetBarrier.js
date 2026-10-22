'use strict';

// 1.5 = marge de 50 % au-dessus du budget global (ADR 0720). Absorbe les pics
// de demande transitoires sans refuser immédiatement les contrats, tout en
// conservant une borne dure qui empêche la sur-allocation unbounded (1,2 trop
// serré, 2,0 trop permissif). Valeur par défaut révisable via overcommitRatio.
const DEFAULT_OVERCOMMIT_RATIO = 1.5;

function numericBudget(raw) {
  if (Number.isFinite(raw)) return Number(raw);
  if (raw && typeof raw === 'object' && Number.isFinite(raw.tokens)) return Number(raw.tokens);
  return null;
}

function budgetOf(contract) {
  const direct = numericBudget(contract);
  if (direct !== null) return direct;
  const fromModel = numericBudget(contract && contract.resourceModel && contract.resourceModel.budget);
  if (fromModel !== null) return fromModel;
  const fromNode = numericBudget(contract && contract.budget);
  return fromNode !== null ? fromNode : 0;
}

function resolveRatio(overcommitRatio) {
  if (overcommitRatio === undefined || overcommitRatio === null) return DEFAULT_OVERCOMMIT_RATIO;
  const numeric = Number(overcommitRatio);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function check(contracts, globalBudget, overcommitRatio = DEFAULT_OVERCOMMIT_RATIO) {
  const ratio = resolveRatio(overcommitRatio);
  const baseBudget = numericBudget(globalBudget);
  if (ratio === null || baseBudget === null || baseBudget < 0) {
    return { valid: false, reason: 'invalid globalBudget or overcommitRatio' };
  }
  const limit = baseBudget * ratio;
  let total = 0;
  for (const contract of Array.isArray(contracts) ? contracts : []) {
    total += budgetOf(contract);
  }
  if (total - limit > 1e-9) {
    return { valid: false, reason: `resource budget ${total} exceeds limit ${limit}` };
  }
  return { valid: true, total, limit, overcommitRatio: ratio };
}

module.exports = { DEFAULT_OVERCOMMIT_RATIO, check };
