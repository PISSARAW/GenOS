'use strict';

const { createGraphVariantService } = require('./graph/graphVariantService');
const { createTransactionalVariantService } = require('./transactional/transactionalVariantService');
const { createEpistemicVariantService } = require('./epistemic/epistemicVariantService');
const { createBlackboardVariantService } = require('./blackboard/blackboardVariantService');

function createVariantFacade(syncytium) {
  return {
    ...createGraphVariantService(syncytium),
    ...createTransactionalVariantService(syncytium),
    ...createEpistemicVariantService(syncytium),
    ...createBlackboardVariantService(syncytium)
  };
}

module.exports = { createVariantFacade };
