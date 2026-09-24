'use strict';

const { requiredId } = require('./contractHelpers');

function createIndividual(input = {}) {
  return {
    individualId: requiredId(input.individualId, 'individualId'),
    role: String(input.role || 'worker').trim(),
    genome: input.genome || null,
    phenotype: input.phenotype || {},
    fitnessReceipts: Array.isArray(input.fitnessReceipts) ? input.fitnessReceipts : [],
    status: input.status || 'active'
  };
}

module.exports = { createIndividual };
