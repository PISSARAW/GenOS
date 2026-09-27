'use strict';

function compareOperators(input) {
  const data = input || {};
  const operators = Array.isArray(data.operators) ? data.operators : [];
  const budget = Number(data.budget) || 0;
  const results = operators.map((operator) => ({ id: operator.id, score: Number(operator.score) || 0, cost: Number(operator.cost) || 0, withinBudget: Number(operator.cost) <= budget, moderator: operator.moderator || null }));
  const eligible = results.filter((result) => result.withinBudget);
  const winner = [...eligible].sort((a, b) => b.score - a.score)[0] || null;
  return { results, winner, gain: winner ? winner.score - (Number(data.baseline) || 0) : null, reservedUntouched: data.reservedTouched !== true };
}

function validateComparison(result) {
  return { valid: Boolean(result?.winner && result.reservedUntouched && result.winner.withinBudget), reason: result?.reservedUntouched === false ? 'reserved_touched' : null };
}

module.exports = { compareOperators, validateComparison };
