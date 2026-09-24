'use strict';

const { optimizeTeam } = require('../teamFormation/teamFormationOptimizer');

function affordableCandidates(candidates, budget) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const cost = Number(candidate.estimatedCost) || 0;
    return cost <= budget;
  });
}

function planRecruitment(input = {}) {
  const budget = Math.max(0, Number(input.budget) || 0);
  const slots = Math.max(0, Math.floor(Number(input.availableSlots) || 0));
  if (!input.gap || slots === 0 || budget <= 0) return { status: 'BLOCKED', candidate: null, reason: 'CAPACITY_OR_BUDGET_UNAVAILABLE' };
  const candidates = affordableCandidates(input.candidates, budget);
  const selection = optimizeTeam({ requirements: [input.gap], candidates, capacity: 1, performancePriors: input.performancePriors });
  const winner = selection.selected[0];
  if (!winner) return { status: 'BLOCKED', candidate: null, reason: 'NO_AFFORDABLE_CAPABLE_CANDIDATE' };
  return {
    status: 'RECRUIT', candidate: winner.candidate,
    estimatedCost: Number(winner.candidate.estimatedCost) || 0,
    capability: input.gap.capability || input.gap.name,
    fit: winner.fit.fit
  };
}

module.exports = { planRecruitment };
