'use strict';

function requiresWorkerBarrier(request, plan) {
  const topologies = ['topologyId', 'topology_id', 'topology', 'proposedTopology', 'proposed_topology',
    'morphologyTopology', 'morphology_topology', 'trinityMode', 'trinity_mode'];
  if (topologies.some(field => Boolean(request[field]))) return true;
  const roster = require('../src/services/workerRosterRequestService')
    .resolveWorkerRosterRequest(request, request.mission || request.task || '');
  return Math.max((plan.dispatchWorkers || []).length, roster?.requestedWorkers || 0) > 1;
}

module.exports = {requiresWorkerBarrier};
