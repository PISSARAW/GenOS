'use strict';

const isolatedBaselineTopologyService = require('../isolatedBaselineTopologyService.js');
const biologicalTopology = require('../biologicalTopologyService.js');

async function composeBiologicalMode({ db, context, mode, mission }) {
  const { agent_count: agentCount, cluster_size: clusterSize, fanout, organization } = context.request;
  const workerAssignments = context.request.worker_assignments || context.request.workerAssignments;
  const available = mode === 'a_team' ? (await workerGarage.state(db, context.orchestratorId)).available : undefined;
  const variantId = context.request.variant_id || context.request.variantId || context.request.variant;
  if (mode === 'isolated_baseline') {
    return isolatedBaselineTopologyService.compose({ mission, options: { workerAssignments, variantId } });
  }
  return biologicalTopology.composeMode({
    db, orchestratorId: context.orchestratorId, mode, mission,
    options: { agentCount, clusterSize, fanout, organization, workerAssignments, variantId,
      available, scope: context.request.scope, configuration: context.request.configuration,
      sessionOptions: context.request.sessionOptions }
  });
}

module.exports = { composeBiologicalMode };