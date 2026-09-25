'use strict';

const analytics = require('../analytics/graphAnalyticsService');
const variants = require('../variants/variantPolicyService');

function create() {
  const state = { routeFailures: 0, openGaps: 0, stableTicks: 0, tickCount: 0 };
  return { observe: (result, input = {}) => observe(state, result, input) };
}

function observe(state, result, input) {
  state.tickCount += 1;
  if (isFailure(result)) state.routeFailures += 1;
  if (isOpenGap(result)) state.openGaps += 1;
  const health = result.snapshot ? analytics.assess(result.snapshot) : emptyHealth();
  const stable = isVerifiedSuccess(result) && health.componentCount <= 1 && health.isolatedNodeIds.length === 0;
  state.stableTicks = stable ? state.stableTicks + 1 : 0;
  const fit = variants.analyzeFit({
    routeFailures: state.routeFailures,
    budgetTight: input.budgetTight,
    unknownCapabilities: isOpenGap(result) ? 1 : 0
  });
  return {
    tickCount: state.tickCount,
    stableTicks: state.stableTicks,
    stable,
    pressure: state.routeFailures * 2 + state.openGaps + health.isolatedNodeIds.length + Math.max(0, health.componentCount - 1),
    health,
    recommendedVariant: fit.variant,
    reason: fit.reason
  };
}

function emptyHealth() {
  return { componentCount: 0, isolatedNodeIds: [] };
}

function isFailure(result) {
  return ['ROUTE_FAILED_NO_ALTERNATIVE', 'ROUTE_RETRY_FAILED'].includes(result.status)
    || result.status === 'ROUTE_FAILURE';
}

function isOpenGap(result) {
  return result.status === 'GAP_OPEN' || result.status === 'GROWTH_WAITING_FOR_PROVIDER'
    || result.status === 'GROWTH_WAITING_FOR_VERIFIER';
}

function isVerifiedSuccess(result) {
  return result.status === 'ROUTE_SUCCESS' || result.status === 'ROUTE_RECOVERED';
}

module.exports = { create };
