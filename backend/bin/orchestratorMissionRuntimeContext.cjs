'use strict';

function hasUserTopologyRequest(request) {
  const topologyFields = ['topologyId', 'topology_id', 'proposedTopology', 'proposed_topology',
    'morphologyTopology', 'morphology_topology', 'trinityMode', 'trinity_mode',
    'trinityVariantId', 'trinity_variant_id', 'trinityVariant', 'variant_id'];
  return topologyFields.some((field) => request[field] !== undefined && request[field] !== null && request[field] !== '')
    || Boolean(require('./orchestratorMissionHelpersValues1.cjs').hasUserTopologyRequestValue2({ request }));
}

const pickFirst = (obj, keys) => keys.map((k) => obj[k]).find((v) => v !== undefined);

function missionRuntimeContext(request = {}) {
  const normalized = { ...request,
    worker_assignments: pickFirst(request, ['worker_assignments', 'workerAssignments']),
    successCriteria: pickFirst(request, ['successCriteria', 'success_criteria', 'acceptanceCriteria', 'acceptance_criteria']),
    workerBarrierTimeoutMs: pickFirst(request, ['workerBarrierTimeoutMs', 'worker_barrier_timeout_ms']),
    communicationRequired: pickFirst(request, ['communicationRequired', 'communication_required']),
    coordinationPolicy: pickFirst(request, ['coordinationPolicy', 'coordination_policy']),
    workerTokenLimit: pickFirst(request, ['workerTokenLimit', 'worker_token_limit']),
    morphologyExpression: pickFirst(request, ['morphologyExpression', 'morphology_expression']),
    morphogenesisPolicy: pickFirst(request, ['morphogenesisPolicy', 'morphogenesis_policy']),
    userTopologyRequested: hasUserTopologyRequest(request) };
  const fields = ['organization', 'capabilities', 'capabilityRequirements', 'capabilityContract',
    'topologyContract', 'capabilityCatalog', 'conceptResolution', 'conceptLeaseCandidates',
    'strategyConcept', 'compatibleConcepts', 'developmentalContext', 'worker_assignments', 'native_objectives',
    'morphologyPlan', 'morphologyExpression', 'morphogenesisPolicy', 'missionCapabilityPlan',
    'problemProfile', 'sensoryContext', 'requiresEvidenceBeforePromotion', 'successCriteria', 'hypotheses',
    'workerBarrierTimeoutMs', 'communicationRequired', 'coordinationPolicy', 'workerTokenLimit', 'localCodeWorker', 'requiredPatchPaths',
    'requiredPatchMarkers', 'requiredPatchMinimumBytes',
    'requiredTools', 'toolLease', 'userTopologyRequested',
    'worker_roster', 'workerRoster', 'worker_count', 'workerCount', 'worker_task_count', 'workerTaskCount',
    'worker_type_policy', 'workerTypePolicy', 'worker_types', 'workerTypes'];
  return Object.fromEntries(fields.filter((field) => normalized[field] !== undefined)
    .map((field) => [field, normalized[field]]));
}

module.exports = missionRuntimeContext;
