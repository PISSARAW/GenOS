'use strict';

/**
 * @file strategySelectorPortfolio.js
 * @description Portfolio selection functions for strategy selection
 */

const { PREFERRED_PRIMARY } = require('./strategySelectorConstants');
const { firstDefined } = require('./strategySelectorHelpers');
const { sortEligible, scoreOf } = require('./strategySelectorSorting');

function resolvePortfolioSize(source) {
  const requested = Math.floor(Number(source.portfolioSize) || 12);
  return Math.max(4, Math.min(16, requested));
}

function portfolioEligible(strategy, inhibited, decisions) {
  if (inhibited.has(strategy.id)) return false;
  const decision = decisions.find((item) => item.strategy.id === strategy.id);
  if (!decision) return false;
  return Boolean(decision.eligible);
}

function composePortfolio(ids, inhibited, decisions) {
  const result = [];
  for (const id of [...ids]) {
    if (!id || id === 'undefined') continue;
    const strategy = getStrategy(id);
    if (!strategy) continue;
    if (portfolioEligible(strategy, inhibited, decisions)) {
      result.push(strategy);
    }
  }
  return result;
}

function preferredStrategyIds(profile) {
  const ids = new Set([PREFERRED_PRIMARY[profile.type], 'retrieval_first', 'negative_knowledge', 'zero_trust', 'tool_output_validation', 'execution_guardrails']);
  if (profile.requires_reproducibility) ids.add('deterministic_replay');
  ids.add(profile.objectives_conflict ? 'pareto_frontier' : 'successive_halving');
  if (profile.complexity >= 0.7) ids.add(profile.risk === 'high' ? 'blind_adversarial_review' : 'specialist_expert_committee');
  return ids;
}

function fillUniqueFamilies(portfolio, eligible, context) {
  const { portfolioSize, inhibited, families } = context;
  for (const candidate of eligible) {
    if (portfolio.length >= portfolioSize) break;
    if (!inhibited.has(candidate.strategy.id) && !families.has(candidate.strategy.family)) {
      portfolio.push(candidate.strategy);
      families.add(candidate.strategy.family);
    }
  }
}

function fillRemaining(portfolio, eligible, context) {
  const { portfolioSize, inhibited } = context;
  for (const candidate of eligible) {
    if (portfolio.length >= portfolioSize) break;
    if (!inhibited.has(candidate.strategy.id) && !portfolio.some((item) => item.id === candidate.strategy.id)) {
      portfolio.push(candidate.strategy);
    }
  }
}

function choosePortfolio(decisions, profile, options = {}) {
  const portfolioSize = resolvePortfolioSize(options);
  const inhibited = new Set(options.inhibitedStrategyIds || []);
  const eligible = sortEligible(decisions);
  const portfolio = composePortfolio(preferredStrategyIds(profile), inhibited, decisions);
  const families = new Set(portfolio.map((strategy) => strategy.family));
  const context = { portfolioSize, inhibited, families };
  fillUniqueFamilies(portfolio, eligible, context);
  fillRemaining(portfolio, eligible, context);
  return portfolio;
}

function planPolicies(profile) {
  return {
    allocation: profile.complexity >= 0.7 ? 'successive_halving_with_reallocation' : 'equal_minimum_then_score_weighted',
    evaluation: profile.objectives_conflict ? 'pareto_frontier_and_knee_point' : profile.evaluability === 'deterministic_tests' ? 'hard_tests_then_weighted_fitness' : 'evidence_weighted_fitness',
    merge: profile.risk === 'high' ? 'human_approved_cognitive_merge' : 'conditional_winner_promotion'
  };
}

const { getStrategy } = require('./strategyRegistry');

module.exports = {
  resolvePortfolioSize,
  portfolioEligible,
  composePortfolio,
  preferredStrategyIds,
  fillUniqueFamilies,
  fillRemaining,
  choosePortfolio,
  planPolicies,
};