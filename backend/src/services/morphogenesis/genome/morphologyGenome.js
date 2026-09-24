'use strict';

const EVOLVABLE_FIELDS = Object.freeze(['topologyTree', 'operatorParameters', 'variants', 'communicationPolicies', 'authorityPolicies', 'stateBoundaries', 'transitionPolicies', 'resourcePolicies']);

function validateMorphologyGenome(genome = {}) {
  return EVOLVABLE_FIELDS.filter((field) => genome[field] === undefined).map((field) => `missing ${field}`);
}

function mutateGenome(genome, mutation) {
  if (!EVOLVABLE_FIELDS.includes(mutation.field) || mutation.evolvable !== true) throw new Error('mutation target is not marked EVOLVABLE');
  return { ...genome, [mutation.field]: mutation.value };
}

function recombineGenomes(left, right, fields = []) {
  const selected = fields.filter((field) => EVOLVABLE_FIELDS.includes(field));
  return selected.reduce((result, field, index) => ({ ...result, [field]: index % 2 === 0 ? left[field] : right[field] }), { ...left });
}

module.exports = { EVOLVABLE_FIELDS, mutateGenome, recombineGenomes, validateMorphologyGenome };
