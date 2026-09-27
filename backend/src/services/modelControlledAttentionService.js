'use strict';

function predictAllocation(input) {
  const candidates = Array.isArray(input?.candidates) ? input.candidates : [];
  const state = input?.state || {};
  return candidates.map((candidate) => ({ id: candidate.id, predictedDemand: (Number(candidate.baseDemand) || 0) + (Number(state[candidate.stateKey]) || 0), reason: candidate.stateKey || 'baseline' }));
}

function reallocate(input) {
  const predictions = predictAllocation(input);
  const budget = Math.max(1, Number(input?.budget) || predictions.length || 1);
  const selected = [...predictions].sort((a, b) => b.predictedDemand - a.predictedDemand).slice(0, budget);
  return { predictions, selected, leases: selected.map((item) => ({ specialistId: item.id, lease: 'attention', predictedDemand: item.predictedDemand })) };
}

function scorePrediction(predicted, actual) {
  const expected = new Set((predicted || []).map((item) => item.id));
  const observed = new Set(Array.isArray(actual) ? actual : []);
  const union = new Set([...expected, ...observed]);
  const overlap = [...expected].filter((id) => observed.has(id)).length;
  return union.size ? overlap / union.size : 1;
}

module.exports = { predictAllocation, reallocate, scorePrediction };
