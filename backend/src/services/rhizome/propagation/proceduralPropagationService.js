'use strict';

const valueService = require('./propagationValueService');
const propagation = require('../../proceduralRhizomePropagationService');

function hasLocalEvidence(input) {
  return input.localValidation?.status === 'VERIFIED'
    && Array.isArray(input.localValidation.evidenceRefs) && input.localValidation.evidenceRefs.length > 0;
}

function propagate(input) {
  if (!hasLocalEvidence(input)) return { assimilated: false, reason: 'LOCAL_VALIDATION_REQUIRED', value: 0 };
  if (input.requireCausalValidation && !verifiedEvidence(input.causalValidation)) {
    return { assimilated: false, reason: 'CAUSAL_VALIDATION_REQUIRED', value: 0 };
  }
  const value = valueService.value(input);
  if (value <= 0) return { assimilated: false, reason: 'NON_POSITIVE_PROPAGATION_VALUE', value };
  const fragment = propagation.validateFragment(input.fragment, (item) => item.procedure != null);
  const targets = input.targets || [input.target];
  if (input.requireCompatibilityTrials && targets.length > 1 && !compatibleTargets(targets, input.compatibilityTrials)) {
    return { assimilated: false, reason: 'COMPATIBILITY_TRIALS_REQUIRED', value };
  }
  return assimilateTargets({ targets, fragment, input, value });
}

function assimilateTargets(context) {
  const results = context.targets.map((target) => propagation.assimilate(target, {
    ...context.fragment, validated: context.fragment.validated && hasLocalEvidence(context.input)
  }));
  const reason = context.targets.length > 1 ? 'CULTURAL_TRANSMISSION_VALIDATED' : 'LOCALLY_VALIDATED';
  return { assimilated: true, reason, value: context.value, result: results[0], results, propagationTrace: propagation.tracePropagation([context.fragment]) };
}

function verifiedEvidence(validation) {
  return validation?.status === 'VERIFIED' && Array.isArray(validation.evidenceRefs) && validation.evidenceRefs.length > 0;
}

function compatibleTargets(targets, trials) {
  return Array.isArray(trials) && targets.every((target) => trials.some((trial) => trial.targetId === target.id
    && verifiedEvidence(trial)));
}

module.exports = { propagate };
