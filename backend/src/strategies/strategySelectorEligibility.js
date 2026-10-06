'use strict';

/**
 * @file strategySelectorEligibility.js
 * @description Eligibility and scoring functions for strategy selection
 */

function getStrategyHandlers() {
  return require('../services/strategyExecutionAdapter').getHandlers();
}

function compatibilityFailure(strategy, profile) {
  if (strategy.id === 'axolotl_regeneration' && (profile.structuralFailure || profile.regenerationNeeded)) return null;
  if (strategy.problemTypes.includes('all') || strategy.problemTypes.includes(profile.type)) return null;
  return `not compatible with ${profile.type}`;
}

function computerUseFailure(strategy, profile) {
  if (strategy.id === 'computer_use_direct' && profile.type !== 'desktop_control') {
    return 'computer-use strategy requires a desktop_control problem';
  }
  return null;
}

function primitiveFailure(strategy) {
  const missingPrimitives = strategy.primitives.filter((primitive) => !getStrategyHandlers()[primitive]);
  if (missingPrimitives.length) return `unimplemented primitives: ${missingPrimitives.join(', ')}`;
  return null;
}

function maturityFailure(strategy, options) {
  if (strategy.maturity === 'partial') return 'strategy has incomplete primitive coverage';
  if (strategy.costLevel > options.maxCostLevel) return `cost level ${strategy.costLevel} exceeds ${options.maxCostLevel}`;
  if (strategy.maturity === 'prototype' && !options.allowPrototype) return 'prototype disabled by policy';
  if (strategy.maturity === 'experimental' && !options.allowExperimental) return 'experimental strategy disabled by policy';
  return null;
}

function highRiskFailure(strategy, profile, options) {
  if (profile.risk === 'high' && strategy.maturity !== 'implemented' && !options.allowExperimentalAtHighRisk) {
    return 'non-implemented strategy blocked for high-risk problem';
  }
  return null;
}

function eligibility(strategy, profile, options) {
  const reason = compatibilityFailure(strategy, profile)
    || computerUseFailure(strategy, profile)
    || primitiveFailure(strategy)
    || maturityFailure(strategy, options)
    || highRiskFailure(strategy, profile, options);
  if (reason) return { eligible: false, reason };
  return { eligible: true, reason: 'constraints satisfied' };
}

function baseTraitPoints(strategy, profile) {
  let score = strategy.problemTypes.includes(profile.type) ? 48 : 24;
  if (PREFERRED_PRIMARY[profile.type] === strategy.id) score += 12;
  return score;
}

const { PREFERRED_PRIMARY } = require('./strategySelectorConstants');
const { applyTraitBonusesOne, applyTraitBonusesTwo, applyTraitBonusesThree, applyTraitBonusesFour, applyTraitBonusesFive, applyTraitBonusesSix } = require('./strategySelectorHelpers');

function costPenalty(strategy, profile) {
  return strategy.costLevel * 1.8 + strategy.latencyLevel * 1.1 + strategy.riskLevel * (profile.risk === 'low' ? 1.4 : 0.4);
}

function maturityPenalty(strategy) {
  if (strategy.maturity === 'experimental') return 10;
  if (strategy.maturity === 'prototype') return 28;
  return 0;
}

function scoreStrategy(strategy, profile) {
  return explainScore(strategy, profile).total;
}

function explainScore(strategy, profile) {
  const traits = new Set(strategy.traits);
  const base = baseTraitPoints(strategy, profile);
  const state = { score: base, bonus: 0, applied: [], unknown: [] };
  applyTraitBonusesOne(state, traits, profile);
  applyTraitBonusesTwo(state, traits, profile);
  applyTraitBonusesThree(state, traits, profile);
  applyTraitBonusesFour(state, traits, profile);
  applyTraitBonusesFive(state, traits, profile);
  applyTraitBonusesSix(state, traits, profile);
  const cost = costPenalty(strategy, profile);
  const maturity = maturityPenalty(strategy);
  const total = Number((base + state.bonus - cost - maturity).toFixed(3));
  return { total, base, compatibilityBonus: state.bonus, applied: state.applied, costPenalty: Number(cost.toFixed(3)), maturityPenalty: maturity, unknownTraits: state.unknown };
}

module.exports = {
  compatibilityFailure,
  computerUseFailure,
  primitiveFailure,
  maturityFailure,
  highRiskFailure,
  eligibility,
  baseTraitPoints,
  scoreStrategy,
  explainScore,
  costPenalty,
  maturityPenalty,
};