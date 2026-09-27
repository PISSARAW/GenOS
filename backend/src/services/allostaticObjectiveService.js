'use strict';

function normalizeObjectives(objectives) {
  const list = Array.isArray(objectives) ? objectives : [];
  return list.map((objective) => ({ id: objective.id, weight: Math.max(0, Number(objective.weight) || 0), value: Number(objective.value) || 0, minimum: Number(objective.minimum) || 0 }));
}

function evaluate(input) {
  const objectives = normalizeObjectives(input?.objectives);
  const pressure = Math.max(0, Number(input?.pressure) || 0);
  const total = objectives.reduce((sum, objective) => sum + objective.weight * objective.value, 0);
  const violations = objectives.filter((objective) => objective.value < objective.minimum).map((objective) => objective.id);
  return { objectives, utility: Number((total - pressure).toFixed(4)), pressure, violations, invariantSatisfied: violations.length === 0 };
}

function comparePolicies(policies) {
  const evaluated = (Array.isArray(policies) ? policies : []).map((policy) => ({ id: policy.id, ...evaluate(policy) }));
  return evaluated.sort((a, b) => b.utility - a.utility).map((policy, index) => ({ ...policy, rank: index + 1 }));
}

function updateAllostasis(state, observation) {
  const current = Number(state?.pressure) || 0;
  const error = Number(observation?.error) || 0;
  return { ...state, pressure: Math.max(0, Number((current + error * 0.2).toFixed(4))), updated: true };
}

module.exports = { normalizeObjectives, evaluate, comparePolicies, updateAllostasis };
