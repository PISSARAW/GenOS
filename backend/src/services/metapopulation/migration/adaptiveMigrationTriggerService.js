'use strict';

function evaluateTrigger(input = {}) {
  const reasons = collectReasons(input);
  const blockedBy = collectGates(input);
  return { triggered: reasons.length > 0 && blockedBy.length === 0, reasons, blockedBy, evaluatedAt: input.now || new Date().toISOString() };
}

function collectReasons(input) {
  return [...stagnationReason(input), ...improvementReason(input), ...generationReason(input), ...islandSearchReasons(input)];
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

function islandSearchReasons(input) {
  if (input.variant !== 'island_search') return [];
  const reasons = [];
  if (input.incumbentImproved === true) reasons.push('INCUMBENT_IMPROVED');
  if (input.counterexampleFound === true) reasons.push('COUNTEREXAMPLE_FOUND');
  if (input.boundTightened === true) reasons.push('BOUND_TIGHTENED');
  if (Number.isFinite(input.diversityScore) && input.diversityScore < (input.minDiversity || 0.3)) reasons.push('LOW_DIVERSITY');
  return reasons;
}

function collectGates(input) {
  return [...costGate(input), ...synchronizationGate(input), ...budgetGate(input), ...islandSearchGates(input)];
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

function islandSearchGates(input) {
  if (input.variant !== 'island_search') return [];
  const gates = [];
  if (input.migrationCount && input.maxMigrationsPerInterval && input.migrationCount >= input.maxMigrationsPerInterval) {
    gates.push('MIGRATION_RATE_LIMIT');
  }
  return gates;
}

function calculateAdaptiveInterval(input = {}) {
  const baseInterval = input.baseInterval || 5;
  const variant = input.variant || 'balanced';
  if (variant === 'island_search') return islandSearchInterval(baseInterval, input);
  if (variant === 'stepping_stone') return Math.max(10, baseInterval * 2);
  return baseInterval;
}

function islandSearchInterval(baseInterval, input) {
  const multiplier = islandSearchMultiplier(input);
  return Math.max(1, Math.min(20, Math.round(baseInterval * multiplier)));
}

function islandSearchMultiplier(input) {
  return stalledFactor(input) * breakthroughFactor(input) * diversityFactor(input) * synchronyFactor(input);
}

function stalledFactor(input) {
  return input.stagnationGenerations && input.stagnationGenerations > 10 ? 0.5 : 1.0;
}

function breakthroughFactor(input) {
  if (input.incumbentImproved === true) return 0.3;
  return input.counterexampleFound === true ? 0.5 : 1.0;
}

function diversityFactor(input) {
  return Number.isFinite(input.diversityScore) && input.diversityScore < 0.3 ? 0.7 : 1.0;
}

function synchronyFactor(input) {
  return Number.isFinite(input.synchronizationRisk) && input.synchronizationRisk > 0.7 ? 2.0 : 1.0;
}

module.exports = { evaluateTrigger, calculateAdaptiveInterval };
