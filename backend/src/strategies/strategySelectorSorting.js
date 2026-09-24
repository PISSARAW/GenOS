'use strict';

/**
 * @file strategySelectorSorting.js
 * @description Sorting and decision functions for strategy selection
 */

const { firstDefined } = require('./strategySelectorHelpers');

function sortEligible(decisions) {
  return decisions
    .filter((item) => item.eligible)
    .sort((a, b) => b.score - a.score || a.strategy.id.localeCompare(b.strategy.id));
}

function scoreOf(decisions, strategy) {
  const decision = decisions.find((item) => item.strategy.id === strategy.id);
  if (decision) return firstDefined(decision.score, -Infinity);
  return -Infinity;
}

function bestByScore(portfolio, decisions) {
  return portfolio
    .slice()
    .sort((left, right) => scoreOf(decisions, right) - scoreOf(decisions, left))[0];
}

function resolvePrimary(portfolio, decisions, requestedPrimary) {
  const requested = portfolio.find((strategy) => strategy.id === requestedPrimary);
  if (requested) return requested;
  const best = bestByScore(portfolio, decisions);
  if (best) return best;
  // Last resort: return the first eligible decision
  const eligible = sortEligible(decisions);
  if (eligible.length > 0) return eligible[0].strategy;
  return null;
}

function reasonForFallback(decision) {
  if (decision) return decision.reason || 'requested strategy was not eligible';
  return 'requested strategy was not eligible';
}

function buildFallback(requestedPrimary, primary, requestedDecision) {
  if (requestedPrimary === primary.id) return null;
  return {
    requested: requestedPrimary,
    selected: primary.id,
    reason: reasonForFallback(requestedDecision)
  };
}

function scoreForSort(decision) {
  return firstDefined(decision.score, -Infinity);
}

function sortDecisions(decisions) {
  return decisions.sort((a, b) => scoreForSort(b) - scoreForSort(a) || a.strategy.id.localeCompare(b.strategy.id));
}

function summarizeDecisions(decisions, portfolio) {
  const selected = new Set(portfolio.map((strategy) => strategy.id));
  const statuses = { selected: 0, eligible_not_selected: 0, ineligible: 0 };
  const maturity = {};
  const family = {};
  for (const decision of decisions) {
    decision.status = selected.has(decision.strategy.id) ? 'selected' : decision.eligible ? 'eligible_not_selected' : 'ineligible';
    decision.reason = decision.status === 'selected' ? 'selected for the composed execution portfolio' : decision.reason;
    statuses[decision.status] += 1;
    maturity[decision.strategy.maturity] = (maturity[decision.strategy.maturity] || 0) + 1;
    family[decision.strategy.family] = (family[decision.strategy.family] || 0) + 1;
  }
  return { total_registry: decisions.length, ...statuses, by_maturity: maturity, by_family: family };
}

module.exports = {
  sortEligible,
  scoreOf,
  bestByScore,
  resolvePrimary,
  reasonForFallback,
  buildFallback,
  scoreForSort,
  sortDecisions,
  summarizeDecisions,
};