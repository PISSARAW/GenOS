'use strict';

function measuredModelUsage(context) {
  return context.unboundUsage || context.rows.some((row) => context.Number(row.provider_called) === 1
      && (row.token_usage_source !== 'provider'
        || row.input_tokens == null || row.output_tokens == null || row.cost_usd == null
        || !context.Number.isSafeInteger(context.Number(row.input_tokens))
        || !context.Number.isSafeInteger(context.Number(row.output_tokens))
        || !context.Number.isFinite(context.Number(row.cost_usd))));
}

function hasUserTopologyRequest(context) {
  return context.request.morphology?.topology || context.request.morphologyPlan?.selectedTopology || context.request.missionCapabilityPlan?.topology
      || context.request.mission_capability_plan?.topology || context.request.topologyContract?.mode
      || context.request.topologyContract?.topology;
}

module.exports = { measuredModelUsage, hasUserTopologyRequest };
