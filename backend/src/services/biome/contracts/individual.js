'use strict';

const { requiredId } = require('./contractHelpers');

function createIndividual(input = {}) {
  return {
    individualId: requiredId(input.individualId, 'individualId'),
    role: String(input.role || 'worker').trim(),
    genome: input.genome || null,
    phenotype: input.phenotype || {},
    capabilities: stringList(input.capabilities),
    fundamentalNicheIds: stringList(input.fundamentalNicheIds),
    realizedNicheId: input.realizedNicheId || null,
    nicheAssessment: input.nicheAssessment || null,
    fitnessReceipts: Array.isArray(input.fitnessReceipts) ? input.fitnessReceipts : [],
    status: input.status || 'active'
  };
}

function stringList(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))] : [];
}

module.exports = { createIndividual };
