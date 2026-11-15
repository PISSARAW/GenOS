'use strict';

function morphogenesisWorkerAssignmentsRule1(context) {
  return context.Array.isArray(context.assignments)
    ? context.assignments[context.mapperIndex] || {}
    : context.assignments?.environment_mapper || {};
}

function morphogenesisWorkerAssignmentsRule2(context) {
  return context.Array.isArray(context.assignments)
    ? context.assignments.findIndex((item) => context.String(item?.topologyRole || item?.role || '').toLowerCase() === 'environment_mapper')
    : -1;
}

function morphogenesisWorkerAssignmentsRule3(context) {
  return context.assignedTopology || context.topology || '';
}

function morphogenesisWorkerAssignmentsRule4(context) {
  return !context.facts.items.length || !context.facts.groups || !context.facts.capacity;
}

function validateBiomeAllocationRule5(context) {
  return context.workerAssignment.topologyRole || context.assignment?.topologyRole || context.assignment?.role || '';
}

function allocationFactsRule6(context) {
  return context.capacityMatch?.[1] || context.capacityMatch?.[2] || context.capacityMatch?.[3]
    || context.capacityMatch?.[4] || context.source.match(/\bmax\s*=\s*(\d+)\b/i)?.[1];
}

function validateBiomeAllocationRule7(context) {
  return context.assignment?.workerAssignment || context.assignment || {};
}

function allocationFactsRule8(context) {
  return context.source.match(/\b(\d+)\s+groupes?\b/i)?.[1]
    || context.source.match(/\bgroups\s*=\s*(\d+)\b/i)?.[1]
    || context.source.match(/\bexactly\s+(\d+)\s+non-empty\s+bins\b/i)?.[1];
}

function validateBiomeAllocationRule9(context) {
  return !context.facts.items.length || !context.facts.groups || !context.facts.capacity;
}

function validateBiomeAllocationRule10(context) {
  return context.workerAssignment.topology || context.assignment?.morphologyTopology || '';
}

function validateBiomeAllocationRule11(context) {
  return context.role !== 'resource_steward' || (context.topology && context.topology !== 'biome');
}

function morphogenesisMissionPromptRule12(context) {
  return context.workerAssignment.topologyRole || context.assignment?.topologyRole || context.assignment?.role || '';
}

function morphogenesisMissionPromptRule13(context) {
  return context.assignment?.workerAssignment || context.assignment || {};
}

function bindBiomeMapperAssignment(context) {
  return context.assignment?.workerAssignment || context.assignment || {};
}

function morphogenesisRoleInstruction(context) {
  return context.workerAssignment.topologyRole || context.assignment?.topologyRole || context.assignment?.role || '';
}

function morphogenesisMissionPromptRule16(context) {
  return !context.facts.items.length || !context.facts.groups || !context.facts.capacity;
}

module.exports = { morphogenesisWorkerAssignmentsRule1, morphogenesisWorkerAssignmentsRule2, morphogenesisWorkerAssignmentsRule3, morphogenesisWorkerAssignmentsRule4, validateBiomeAllocationRule5, allocationFactsRule6, validateBiomeAllocationRule7, allocationFactsRule8, validateBiomeAllocationRule9, validateBiomeAllocationRule10, validateBiomeAllocationRule11, morphogenesisMissionPromptRule12, morphogenesisMissionPromptRule13, bindBiomeMapperAssignment, morphogenesisRoleInstruction, morphogenesisMissionPromptRule16 };
