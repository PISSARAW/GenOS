'use strict';

function missionRuntimeContext(request = {}) {
  const normalized = { ...request,
    successCriteria: request.successCriteria || request.success_criteria || request.acceptanceCriteria || request.acceptance_criteria,
    workerBarrierTimeoutMs: request.workerBarrierTimeoutMs || request.worker_barrier_timeout_ms,
    communicationRequired: request.communicationRequired ?? request.communication_required,
    morphologyExpression: request.morphologyExpression || request.morphology_expression,
    morphogenesisPolicy: request.morphogenesisPolicy || request.morphogenesis_policy };
  const fields = ['organization', 'capabilities', 'capabilityRequirements', 'capabilityContract',
    'topologyContract', 'capabilityCatalog', 'conceptResolution', 'conceptLeaseCandidates',
    'strategyConcept', 'compatibleConcepts', 'developmentalContext', 'worker_assignments', 'native_objectives',
    'morphologyPlan', 'morphologyExpression', 'morphogenesisPolicy', 'missionCapabilityPlan',
    'problemProfile', 'sensoryContext', 'requiresEvidenceBeforePromotion', 'successCriteria',
    'workerBarrierTimeoutMs', 'communicationRequired', 'localCodeWorker', 'requiredPatchPaths',
    'requiredPatchMarkers', 'requiredPatchMinimumBytes'];
  return Object.fromEntries(fields.filter((field) => normalized[field] !== undefined)
    .map((field) => [field, normalized[field]]));
}

module.exports = missionRuntimeContext;
