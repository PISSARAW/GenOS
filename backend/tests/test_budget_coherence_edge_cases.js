'use strict';

const assert = require('node:assert/strict');
const { validateBudgetCoherence } = require('../src/services/budgetCoherenceService');

function checkInvalidTotals() {
  for (const total of ['not-a-number', Number.NaN, Number.POSITIVE_INFINITY, 0, -1, true]) {
    const result = validateBudgetCoherence({ executionBudget: { tokens: 100 }, autonomyPlan: { tokenPolicy: { total } } });
    assert.equal(result.valid, false, `invalid total ${String(total)} must fail closed`);
  }
}

function checkRoundPools() {
  const result = validateBudgetCoherence({ executionBudget: { tokens: 100 }, autonomyPlan: {
    tokenPolicy: { total: 100, workerShare: 0.6, orchestratorReserve: 0.4,
      rounds: { initial: { pool: 110 }, continuation: { pool: -10 } } }
  } });
  assert.equal(result.valid, false, 'a negative pool cannot offset a round overrun');
  assert.match(result.reason, /non-negative/);
}

function checkWorkerShare() {
  const result = validateBudgetCoherence({ executionBudget: { tokens: 100 }, autonomyPlan: {
    tokenPolicy: { total: 100, workerShare: 0.6, orchestratorReserve: 0.4, rounds: { initial: { pool: 61 } } }
  } });
  assert.equal(result.valid, false, 'worker rounds cannot consume the orchestrator reserve');
  assert.match(result.reason, /worker pool/);
  assert.throws(() => validateBudgetCoherence({ executionBudget: { tokens: 100, workerShare: 1.2,
    orchestratorReserve: -0.2 }, autonomyPlan: { tokenPolicy: { total: 100 } } }), { code: 'INVALID_BUDGET_SHARE' });
}

checkInvalidTotals();
checkRoundPools();
checkWorkerShare();
console.log('Budget coherence malformed totals, pools, and shares fail closed.');
