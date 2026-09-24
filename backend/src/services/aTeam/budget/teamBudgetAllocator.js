'use strict';

const { estimateMarginalValue } = require('./marginalValueService');

function allocateTeamBudget(input = {}) {
  const budget = Math.max(0, Number(input.totalBudget) || 0);
  const work = Array.isArray(input.work) ? input.work : [];
  const weighted = work.map((item) => ({ item, weight: weightFor(item) }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  return {
    totalBudget: budget,
    allocations: weighted.map(({ item, weight }) => ({ id: item.id, amount: totalWeight ? budget * weight / totalWeight : 0, weight })),
    unallocated: totalWeight ? 0 : budget
  };
}

function weightFor(item) {
  const value = estimateMarginalValue(item).score;
  return Math.max(0.01, value * unit(item.criticalPath) * (0.5 + unit(item.uncertainty) / 2) * (0.5 + unit(item.interfaceComplexity) / 2));
}

function unit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

module.exports = { allocateTeamBudget, weightFor };
