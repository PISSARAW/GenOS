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

function resolveSelectionProfile(input, problem) {
  const overrides = { ...(input.problemProfile || {}) };
  const failure = input.failureContext || input.failure_context || input.regenerationAssessment || {};
  if (overrides.structuralFailure === undefined) {
    overrides.structuralFailure = failure.structural === true || failure.structuralFailure === true;
  }
  overrides.regenerationNeeded = require('../services/axolotlRecoveryPolicy').assess({ ...input, failureContext: failure })?.needed === true;
  return profileProblem(problem, overrides);
}

function selectStrategyPortfolio(input = {}) {
  const problem = resolveProblem(input);
  const profile = resolveSelectionProfile(input, problem);
  const options = resolveOptions(input);
  const requestedPrimary = input.requestedPrimary || require('../services/axolotlRecoveryPolicy').preferredPrimary(input) || PREFERRED_PRIMARY[profile.type];
  if (input.requestedPrimary && !getStrategy(input.requestedPrimary)) {
    throw Object.assign(new Error(`Unknown requested strategy '${input.requestedPrimary}'.`), { code: 'STRATEGY_REQUEST_UNKNOWN' });
  }
  options.requestedPrimary = requestedPrimary;
  const decisions = buildDecisions(profile, options);
  const portfolio = choosePortfolio(decisions, profile, options);
  const requestedDecision = decisions.find((item) => item.strategy.id === requestedPrimary);
  const primary = resolvePrimary(portfolio, decisions, requestedPrimary);
  if (!primary) {
    const eligible = decisions.filter((d) => d.eligible);
    if (!eligible.length) throw Object.assign(new Error('No strategy satisfies the execution constraints.'), { code: 'STRATEGY_NO_ELIGIBLE_CANDIDATE' });
    const pool = eligible;
    const fallback = bestByScore(pool, decisions);
    if (!fallback) throw new Error('No strategy available');
    const fallbackObj = { requested: requestedPrimary, selected: fallback.strategy.id, reason: 'primary unavailable' };
    const decisionsWithFallback = decisions.map((decision) => decision.id === fallback.strategy.id
      ? { ...decision, status: 'selected', eligible: true, score: decision.score ?? 0.001 }
      : decision);
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
