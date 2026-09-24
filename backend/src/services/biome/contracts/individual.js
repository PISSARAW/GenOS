'use strict';

const { requiredId } = require('./contractHelpers');

function createIndividual(input = {}) {
  const phenotype = input.phenotype || {};
  return {
    individualId: requiredId(input.individualId, 'individualId'),
    role: String(defaulted(input, 'role', 'worker')).trim(),
    genome: defaulted(input, 'genome', null),
    phenotype,
    cognitiveRecipe: defaulted(input, 'cognitiveRecipe', defaulted(phenotype, 'cognitiveRecipe', null)),
    capabilities: stringList(input.capabilities),
    fundamentalNicheIds: stringList(input.fundamentalNicheIds),
    realizedNicheId: defaulted(input, 'realizedNicheId', null),
    patchId: defaulted(input, 'patchId', null),
    nicheAssessment: defaulted(input, 'nicheAssessment', null),
    fitnessReceipts: Array.isArray(input.fitnessReceipts) ? input.fitnessReceipts : [],
    status: defaulted(input, 'status', 'active')
  };
}

function defaulted(source, key, fallback) {
  return source[key] || fallback;
}

function stringList(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))] : [];
}

module.exports = { createIndividual };
