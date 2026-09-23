'use strict';

/**
 * @file creativePressureResolverService.js
 * @description Dynamic creativity level resolution based on agent state, problem state, and budget.
 * Replaces fixed NCE flags with adaptive creativity pressure.
 */

const CREATIVITY_LEVELS = Object.freeze({
  OFF: 0,
  LOW: 1,
  EXPLORATORY: 2,
  DIVERGENT: 3,
  RADICAL: 4,
});

const LEVEL_NAMES = Object.freeze({
  [CREATIVITY_LEVELS.OFF]: 'CREATIVITY_OFF',
  [CREATIVITY_LEVELS.LOW]: 'CREATIVITY_LOW',
  [CREATIVITY_LEVELS.EXPLORATORY]: 'CREATIVITY_EXPLORATORY',
  [CREATIVITY_LEVELS.DIVERGENT]: 'CREATIVITY_DIVERGENT',
  [CREATIVITY_LEVELS.RADICAL]: 'CREATIVITY_RADICAL',
});

const PHENOTYPES_MAX_LEVEL = Object.freeze({
  BoundedWorker: CREATIVITY_LEVELS.LOW,
  AdaptiveWorker: CREATIVITY_LEVELS.EXPLORATORY,
  SubOrchestrator: CREATIVITY_LEVELS.DIVERGENT,
  Orchestrator: CREATIVITY_LEVELS.RADICAL,
});

const MECHANISMS_BY_LEVEL = Object.freeze({
  [CREATIVITY_LEVELS.OFF]: Object.freeze([]),
  [CREATIVITY_LEVELS.LOW]: Object.freeze(['curiosity']),
  [CREATIVITY_LEVELS.EXPLORATORY]: Object.freeze(['curiosity', 'exaptation']),
  [CREATIVITY_LEVELS.DIVERGENT]: Object.freeze(['curiosity', 'exaptation', 'representationalMutation']),
  [CREATIVITY_LEVELS.RADICAL]: Object.freeze([
    'curiosity', 'exaptation', 'representationalMutation',
    'environmentalCoevolution', 'culturalSelection', 'play',
  ]),
});

const MECHANISM_COSTS = Object.freeze({
  curiosity: 50,
  exaptation: 100,
  representationalMutation: 150,
  environmentalCoevolution: 200,
  culturalSelection: 120,
  play: 180,
});

const DEAD_END_THRESHOLD = 2;
const HIGH_PRESSURE_THRESHOLD = 0.7;
const MIN_BUDGET_FOR_CREATIVITY = 100;
const MAX_BUDGET_PRESSURE_TOKENS = 200;

const PRESSURE_CONDITIONS = Object.freeze([
  (failureState) => (failureState?.repeatedDeadEnds || 0) >= 3,
  (agentCtx) => (agentCtx?.dissonance || 0) > HIGH_PRESSURE_THRESHOLD,
  (failureState) => failureState?.lowInformationGain === true,
  (problemState) => (problemState?.uncertainty || 0) > HIGH_PRESSURE_THRESHOLD,
  (problemState) => (problemState?.novelty || 0) > HIGH_PRESSURE_THRESHOLD,
  (failureState) => (failureState?.repeatedDeadEnds || 0) >= DEAD_END_THRESHOLD,
  (budget) => budget > MAX_BUDGET_PRESSURE_TOKENS,
]);

function getPhenotypeMaxLevel(phenotype) {
  if (!phenotype) return CREATIVITY_LEVELS.OFF;
  const level = PHENOTYPES_MAX_LEVEL[phenotype];
  return level !== undefined ? level : CREATIVITY_LEVELS.OFF;
}

function computePressureScore(ctx) {
  const agentCtx = ctx?.agentExpressionContext || {};
  const problemState = ctx?.problemState || {};
  const failureState = problemState.failureState || {};
  const budget = problemState.budget?.tokens || 0;

  const inputs = [failureState, agentCtx, failureState, problemState, problemState, failureState, budget];
  return PRESSURE_CONDITIONS.reduce((score, cond, i) => cond(inputs[i]) ? score + 1 : score, 0);
}

function pressureToLevel(score, maxLevel) {
  if (score >= 6) return Math.min(CREATIVITY_LEVELS.RADICAL, maxLevel);
  if (score >= 5) return Math.min(CREATIVITY_LEVELS.DIVERGENT, maxLevel);
  if (score >= 4) return Math.min(CREATIVITY_LEVELS.EXPLORATORY, maxLevel);
  if (score >= 2) return Math.min(CREATIVITY_LEVELS.LOW, maxLevel);
  return CREATIVITY_LEVELS.OFF;
}

function getMechanismsForLevel(level) {
  return MECHANISMS_BY_LEVEL[level] || [];
}

function resolveCreativity(ctx) {
  const agentCtx = ctx?.agentExpressionContext || {};
  const problemState = ctx?.problemState || {};
  const budget = problemState.budget?.tokens || 0;

  const maxLevel = getPhenotypeMaxLevel(agentCtx.phenotype);
  const pressureScore = computePressureScore(ctx);
  const rawLevel = pressureToLevel(pressureScore, maxLevel);

  const level = budget >= MIN_BUDGET_FOR_CREATIVITY
    ? rawLevel
    : Math.min(rawLevel, CREATIVITY_LEVELS.LOW);

  const mechanisms = getMechanismsForLevel(level);
  const affordableMechanisms = mechanisms.filter((m) => canAfford(m, budget));

  return {
    level,
    levelName: LEVEL_NAMES[level] || 'CREATIVITY_OFF',
    pressureScore,
    mechanisms,
    affordableMechanisms,
    budget,
  };
}

function getAvailableMechanisms(level) {
  return [...getMechanismsForLevel(level)];
}

function canAfford(mechanism, budget) {
  const cost = MECHANISM_COSTS[mechanism];
  if (cost === undefined) return false;
  return (budget || 0) >= cost;
}

module.exports = {
  CREATIVITY_LEVELS,
  LEVEL_NAMES,
  PHENOTYPES_MAX_LEVEL,
  MECHANISMS_BY_LEVEL,
  MECHANISM_COSTS,
  resolveCreativity,
  getAvailableMechanisms,
  canAfford,
};
