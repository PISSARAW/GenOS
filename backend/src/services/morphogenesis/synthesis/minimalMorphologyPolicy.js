'use strict';

const MORPHOLOGY_LEVELS = Object.freeze([
  'primitive', 'procedure', 'direct_worker', 'resident_symbiont',
  'simple_topology', 'composite_topology', 'ecology'
]);

function candidateErrors(candidate, demand = {}) {
  const errors = [];
  if (candidate.available !== true) errors.push(candidate.reason || 'candidate is not declared available');
  const needed = Array.isArray(demand.requiredCapabilities) ? demand.requiredCapabilities : [];
  const provided = Array.isArray(candidate.capabilities) ? candidate.capabilities : [];
  const missing = needed.filter((capability) => !provided.includes(capability));
  if (missing.length) errors.push(`missing capabilities: ${missing.join(', ')}`);
  const conflicts = Array.isArray(candidate.blockedBy) ? candidate.blockedBy : [];
  const requested = Array.isArray(demand.constraints) ? demand.constraints : [];
  const blocked = conflicts.filter((constraint) => requested.includes(constraint));
  if (blocked.length) errors.push(`conflicting constraints: ${blocked.join(', ')}`);
  if (candidate.profileFit === false) errors.push('candidate does not fit the scoped morphology profile');
  return errors;
}

function evaluateLevels(candidates, demand) {
  return MORPHOLOGY_LEVELS.map((level) => {
    const options = candidates.filter((candidate) => candidate.level === level);
    return { level, options: options.map((candidate) => ({ candidate, errors: candidateErrors(candidate, demand) })) };
  });
}

function chooseLevel(evaluations) {
  for (const evaluation of evaluations) {
    const viable = evaluation.options.find((option) => option.errors.length === 0);
    if (viable) return { evaluation, viable };
  }
  return null;
}

function lowerLevelProof(evaluations, selectedLevel) {
  const lower = evaluations.filter((item) => MORPHOLOGY_LEVELS.indexOf(item.level) < selectedLevel);
  return {
    complete: lower.every((item) => item.options.length > 0),
    rejected: lower.flatMap((item) => item.options.map((option) => ({
      candidateId: option.candidate.id || null,
      level: item.level,
      reasons: option.errors
    }))),
    missingLevels: lower.filter((item) => item.options.length === 0).map((item) => item.level)
  };
}

function selectMinimumMorphology(candidates, demand = {}) {
  const choices = Array.isArray(candidates) ? candidates.filter((candidate) => MORPHOLOGY_LEVELS.includes(candidate.level)) : [];
  const evaluations = evaluateLevels(choices, demand);
  const choice = chooseLevel(evaluations);
  if (!choice) return { valid: false, status: 'no_admissible_candidate', selected: null, errors: ['no candidate satisfies the declared demand'] };
  const selectedIndex = MORPHOLOGY_LEVELS.indexOf(choice.evaluation.level);
  const proof = lowerLevelProof(evaluations, selectedIndex);
  const result = { candidate: choice.viable.candidate, level: choice.evaluation.level, lowerLevelProof: proof };
  if (!proof.complete) {
    return {
      valid: false,
      status: 'insufficient_evidence_for_escalation',
      selected: null,
      provisional: result,
      errors: [`candidates are missing for lower levels: ${proof.missingLevels.join(', ')}`]
    };
  }
  return { valid: true, status: 'minimum_admissible', selected: result, errors: [] };
}

module.exports = { MORPHOLOGY_LEVELS, selectMinimumMorphology };
