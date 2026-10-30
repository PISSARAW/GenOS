'use strict';

function validateLeaseValue1(__genosValueScope1) {
  return __genosValueScope1.plan?.morphologyPatch?.graph
    && __genosValueScope1.plan.selectedTopology === __genosValueScope1.candidate.topology
    && (__genosValueScope1.candidate.kind !== 'VARIANT' || (__genosValueScope1.plan.selectedVariant || 'default') === (__genosValueScope1.candidate.variant || 'default'));
}

function validateWorkersValue2(__genosValueScope2) {
  return __genosValueScope2.requirements.map((requirement) => (0, __genosValueScope2.workerCapabilityDenial)({ ...requirement, assignments: __genosValueScope2.assignments,
    requiredWorkerCapabilities: requirement.requiredWorkerCapabilities
      || (__genosValueScope2.requirements.length === 1 ? __genosValueScope2.candidate.requiredWorkerCapabilities || [] : []),
    strictAttribution: __genosValueScope2.requirements.length > 1 }))
    .find(__genosValueScope2.Boolean) || null;
}

module.exports = { validateLeaseValue1, validateWorkersValue2 };
