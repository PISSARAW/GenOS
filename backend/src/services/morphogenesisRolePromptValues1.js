'use strict';

function morphogenesisWorkerAssignmentsValue1(__genosValueScope1) {
  return __genosValueScope1.Array.isArray(__genosValueScope1.assignments)
    ? __genosValueScope1.assignments[__genosValueScope1.mapperIndex] || {}
    : __genosValueScope1.assignments?.environment_mapper || {};
}

function morphogenesisWorkerAssignmentsValue2(__genosValueScope2) {
  return __genosValueScope2.Array.isArray(__genosValueScope2.assignments)
    ? __genosValueScope2.assignments.findIndex((item) => (0, __genosValueScope2.String)(item?.topologyRole || item?.role || '').toLowerCase() === 'environment_mapper')
    : -1;
}

function morphogenesisWorkerAssignmentsValue3(__genosValueScope3) {
  return __genosValueScope3.assignedTopology || __genosValueScope3.topology || '';
}

function morphogenesisWorkerAssignmentsValue4(__genosValueScope4) {
  return !__genosValueScope4.facts.items.length || !__genosValueScope4.facts.groups || !__genosValueScope4.facts.capacity;
}

function validateBiomeAllocationValue5(__genosValueScope5) {
  return __genosValueScope5.workerAssignment.topologyRole || __genosValueScope5.assignment?.topologyRole || __genosValueScope5.assignment?.role || '';
}

function allocationFactsValue6(__genosValueScope6) {
  return __genosValueScope6.capacityMatch?.[1] || __genosValueScope6.capacityMatch?.[2] || __genosValueScope6.capacityMatch?.[3]
    || __genosValueScope6.capacityMatch?.[4] || __genosValueScope6.source.match(/\bmax\s*=\s*(\d+)\b/i)?.[1];
}

function validateBiomeAllocationValue7(__genosValueScope7) {
  return __genosValueScope7.assignment?.workerAssignment || __genosValueScope7.assignment || {};
}

function allocationFactsValue8(__genosValueScope8) {
  return __genosValueScope8.source.match(/\b(\d+)\s+groupes?\b/i)?.[1]
    || __genosValueScope8.source.match(/\bgroups\s*=\s*(\d+)\b/i)?.[1]
    || __genosValueScope8.source.match(/\bexactly\s+(\d+)\s+non-empty\s+bins\b/i)?.[1];
}

function validateBiomeAllocationValue9(__genosValueScope9) {
  return !__genosValueScope9.facts.items.length || !__genosValueScope9.facts.groups || !__genosValueScope9.facts.capacity;
}

function validateBiomeAllocationValue10(__genosValueScope10) {
  return __genosValueScope10.workerAssignment.topology || __genosValueScope10.assignment?.morphologyTopology || '';
}

function validateBiomeAllocationValue11(__genosValueScope11) {
  return __genosValueScope11.role !== 'resource_steward' || (__genosValueScope11.topology && __genosValueScope11.topology !== 'biome');
}

function morphogenesisMissionPromptValue12(__genosValueScope12) {
  return __genosValueScope12.workerAssignment.topologyRole || __genosValueScope12.assignment?.topologyRole || __genosValueScope12.assignment?.role || '';
}

function morphogenesisMissionPromptValue13(__genosValueScope13) {
  return __genosValueScope13.assignment?.workerAssignment || __genosValueScope13.assignment || {};
}

function bindBiomeMapperAssignmentValue14(__genosValueScope14) {
  return __genosValueScope14.assignment?.workerAssignment || __genosValueScope14.assignment || {};
}

function morphogenesisRoleInstructionValue15(__genosValueScope15) {
  return __genosValueScope15.workerAssignment.topologyRole || __genosValueScope15.assignment?.topologyRole || __genosValueScope15.assignment?.role || '';
}

function morphogenesisMissionPromptValue16(__genosValueScope16) {
  return !__genosValueScope16.facts.items.length || !__genosValueScope16.facts.groups || !__genosValueScope16.facts.capacity;
}

module.exports = { morphogenesisWorkerAssignmentsValue1, morphogenesisWorkerAssignmentsValue2, morphogenesisWorkerAssignmentsValue3, morphogenesisWorkerAssignmentsValue4, validateBiomeAllocationValue5, allocationFactsValue6, validateBiomeAllocationValue7, allocationFactsValue8, validateBiomeAllocationValue9, validateBiomeAllocationValue10, validateBiomeAllocationValue11, morphogenesisMissionPromptValue12, morphogenesisMissionPromptValue13, bindBiomeMapperAssignmentValue14, morphogenesisRoleInstructionValue15, morphogenesisMissionPromptValue16 };
