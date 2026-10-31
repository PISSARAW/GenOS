'use strict';

function measuredModelUsageValue1(__genosValueScope1) {
  return __genosValueScope1.unboundUsage || __genosValueScope1.rows.some((row) => (0, __genosValueScope1.Number)(row.provider_called) === 1
      && (row.token_usage_source !== 'provider'
        || row.input_tokens == null || row.output_tokens == null || row.cost_usd == null
        || !__genosValueScope1.Number.isSafeInteger((0, __genosValueScope1.Number)(row.input_tokens))
        || !__genosValueScope1.Number.isSafeInteger((0, __genosValueScope1.Number)(row.output_tokens))
        || !__genosValueScope1.Number.isFinite((0, __genosValueScope1.Number)(row.cost_usd))));
}

function hasUserTopologyRequestValue2(__genosValueScope2) {
  return __genosValueScope2.request.morphology?.topology || __genosValueScope2.request.morphologyExpression || __genosValueScope2.request.morphology_expression
      || __genosValueScope2.request.morphologyPlan?.selectedTopology || __genosValueScope2.request.missionCapabilityPlan?.topology
      || __genosValueScope2.request.mission_capability_plan?.topology || __genosValueScope2.request.topologyContract?.mode
      || __genosValueScope2.request.topologyContract?.topology;
}

module.exports = { measuredModelUsageValue1, hasUserTopologyRequestValue2 };
