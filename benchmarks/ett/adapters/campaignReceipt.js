'use strict';

function campaignStatus(reason) {
  if (reason === 'provider_usage_unmeasured' || reason === 'provider_call_usage_unknown') {
    return 'partial_campaign_usage_measurement_failed';
  }
  if (reason === 'provider_usage_exceeded_reservation') return 'campaign_budget_reservation_violation';
  return 'partial_campaign_token_budget_reached';
}

function createReport(options, expectedRecords) {
  return { schema: 'genos.ett-runtime-campaign/v4', status: 'running',
    startedAt: new Date().toISOString(), model: options.model,
    scenarioSet: options.scenarios, conditions: options.conditions,
    seeds: Array.from({ length: options.seeds }, (_, index) => 1001 + index * 7919),
    tokenBudget: options.tokenBudget, split: 'development', holdout: false,
    expectedRecords, measuredTokens: 0, records: [], segments: [], scientificClaimAllowed: false,
    providerCallCount: 0, pendingProviderCall: null,
    limitations: ['Local model run; no external API price is measured.',
      'Original Voyager, AI Scientist v2 and DGM executables are not included.'] };
}

module.exports = { campaignStatus, createReport };
