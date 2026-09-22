'use strict';

/**
 * @file strategySelectorOptions.js
 * @description Options resolution functions for strategy selection
 */

const { firstDefined } = require('./strategySelectorHelpers');
const { resolvePortfolioSize } = require('./strategySelectorPortfolio');

function resolveProblem(input) {
  return String(input.problem || input.prompt || '').trim();
}

function getMemoryInhibitedIds(input) {
  const signals = input.memorySignals;
  if (signals) return signals.inhibitedStrategyIds || [];
  return [];
}

function mergeInhibitedIds(input, memoryIds) {
  const localIds = input.inhibitedStrategyIds || [];
  return [...new Set([...localIds, ...memoryIds].map(String))];
}

function resolveOptions(input) {
  return {
    maxCostLevel: firstDefined(input.maxCostLevel, 5),
    allowExperimental: firstDefined(input.allowExperimental, false),
    allowPrototype: firstDefined(input.allowPrototype, false),
    allowExperimentalAtHighRisk: firstDefined(input.allowExperimentalAtHighRisk, false),
    portfolioSize: resolvePortfolioSize(input),
    inhibitedStrategyIds: mergeInhibitedIds(input, getMemoryInhibitedIds(input))
  };
}

module.exports = {
  resolveProblem,
  getMemoryInhibitedIds,
  mergeInhibitedIds,
  resolveOptions,
};