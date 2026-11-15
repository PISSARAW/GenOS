'use strict';

function validateLease(context) {
  return context.plan?.morphologyPatch?.graph
    && context.plan.selectedTopology === context.candidate.topology
    && (context.candidate.kind !== 'VARIANT' || (context.plan.selectedVariant || 'default') === (context.candidate.variant || 'default'));
}

function validateWorkers(context) {
  return context.requirements.map((requirement) => context.workerCapabilityDenial({ ...requirement, assignments: context.assignments,
    requiredWorkerCapabilities: requirement.requiredWorkerCapabilities
      || (context.requirements.length === 1 ? context.candidate.requiredWorkerCapabilities || [] : []),
    strictAttribution: context.requirements.length > 1 }))
    .find(context.Boolean) || null;
}

module.exports = { validateLease, validateWorkers };
