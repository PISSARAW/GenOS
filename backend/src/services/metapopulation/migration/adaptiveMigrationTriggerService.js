'use strict';

function evaluateTrigger(input = {}) {
  const reasons = collectReasons(input);
  const blockedBy = collectGates(input);
  return { triggered: reasons.length > 0 && blockedBy.length === 0, reasons, blockedBy, evaluatedAt: input.now || new Date().toISOString() };
}

function collectReasons(input) {
  return [...stagnationReason(input), ...improvementReason(input), ...generationReason(input)];
}

function stagnationReason(input) {
  const stagnation = Number(input.stagnationGenerations || 0);
  return stagnation >= (input.minStagnationGenerations || 5) ? ['STAGNATION'] : [];
}

function improvementReason(input) {
  return Number(input.improvementDelta || 0) >= (input.minImprovementDelta || 0.1) ? ['IMPROVEMENT'] : [];
}

function generationReason(input) {
  const interval = Number(input.generationInterval || 0);
  const generation = Number(input.generation || 0);
  return interval > 0 && generation > 0 && generation % interval === 0 ? ['GENERATION'] : [];
}

function collectGates(input) {
  return [...costGate(input), ...synchronizationGate(input), ...budgetGate(input)];
}

function costGate(input) {
  return Number(input.estimatedCost || 0) > Number(input.maxCost ?? Number.MAX_SAFE_INTEGER) ? ['COST_LIMIT'] : [];
}

function synchronizationGate(input) {
  return Number(input.synchronizationRisk || 0) > Number(input.maxSynchronizationRisk ?? 1) ? ['SYNCHRONIZATION_RISK'] : [];
}

function budgetGate(input) {
  return Number(input.budgetUsed || 0) + Number(input.estimatedCost || 0) > Number(input.budgetLimit ?? Number.MAX_SAFE_INTEGER) ? ['BUDGET'] : [];
}

module.exports = { evaluateTrigger };
