'use strict';

function tokenBudget(budget) {
  const tokens = typeof budget === 'number' ? budget : budget?.tokens;
  return Number.isFinite(tokens) ? Math.max(0, tokens) : 0;
}

module.exports = { tokenBudget };
