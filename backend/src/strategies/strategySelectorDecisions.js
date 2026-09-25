'use strict';

/**
 * @file strategySelectorDecisions.js
 * @description Decision building functions for strategy selection
 */

const { listStrategies, getStrategy } = require('./strategyRegistry');
const { eligibility, scoreStrategy } = require('./strategySelectorEligibility');
const { resolveOptions } = require('./strategySelectorOptions');
const { sortDecisions, summarizeDecisions } = require('./strategySelectorSorting');
const { choosePortfolio, planPolicies } = require('./strategySelectorPortfolio');
const { resolveProblem, resolveOptions: resolveOptionsMain } = require('./strategySelectorOptions');
const { profileProblem } = require('./strategySelectorHelpers');
const { buildFallback, resolvePrimary, bestByScore } = require('./strategySelectorSorting');
const { PREFERRED_PRIMARY } = require('./strategySelectorConstants');
const { BRANCHES } = require('./strategySelectorConstants');

function buildDecisions(profile, options) {
  return listStrategies().map((strategy) => {
    const constraint = eligibility(strategy, profile, options);
    return {
      id: strategy.id,
      strategy,
      eligible: constraint.eligible,
      score: constraint.eligible ? scoreStrategy(strategy, profile) : null,
      reason: constraint.reason
    };
  });
}

function selectStrategyPortfolio(input = {}) {
  const problem = resolveProblem(input);
  const profile = profileProblem(problem, input.problemProfile || {});
  const options = resolveOptions(input);
  const decisions = buildDecisions(profile, options);
  const portfolio = choosePortfolio(decisions, profile, options);
  const requestedPrimary = PREFERRED_PRIMARY[profile.type];
  const requestedDecision = decisions.find((item) => item.strategy.id === requestedPrimary);
  const primary = resolvePrimary(portfolio, decisions, requestedPrimary);
  if (!primary) {
    const eligible = decisions.filter((d) => d.eligible);
    const pool = eligible.length > 0 ? eligible : decisions;
    const fallback = bestByScore(pool, decisions);
    if (!fallback) throw new Error('No strategy available');
    const fallbackObj = { requested: requestedPrimary, selected: fallback.strategy.id, reason: 'primary unavailable' };
    const fallbackDecision = { ...fallback, id: fallback.strategy.id, status: 'selected', eligible: true, score: fallback.score ?? 0.001 };
    const decisionsWithFallback = decisions.concat([fallbackDecision]);
    const summary = summarizeDecisions(decisions, [fallback.strategy]);
    const policies = planPolicies(profile);
    return { problem, profile, options, primary: fallback.strategy, requestedPrimary, primaryFallback: fallbackObj, portfolio: [fallback.strategy], policies, branches: BRANCHES[profile.type], decisions: sortDecisions(decisionsWithFallback), summary };
  }
  const summary = summarizeDecisions(decisions, portfolio);
  const policies = planPolicies(profile);
  return {
    problem,
    profile,
    options,
    primary,
    requestedPrimary,
    primaryFallback: buildFallback(requestedPrimary, primary, requestedDecision),
    portfolio,
    policies,
    branches: BRANCHES[profile.type],
    decisions: sortDecisions(decisions),
    summary
  };
}

module.exports = { buildDecisions, selectStrategyPortfolio };
