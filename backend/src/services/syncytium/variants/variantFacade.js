'use strict';

const { createGraphVariantService } = require('./graph/graphVariantService');
const { createTransactionalVariantService } = require('./transactional/transactionalVariantService');
const { createEpistemicVariantService } = require('./epistemic/epistemicVariantService');
const { createBlackboardVariantService } = require('./blackboard/blackboardVariantService');
const { createHierarchicalVariantService } = require('./hierarchical/hierarchicalVariantService');

function createVariantFacade(syncytium) {
  return {
    ...createGraphVariantService(syncytium),
    ...createTransactionalVariantService(syncytium),
    ...createEpistemicVariantService(syncytium),
    ...createBlackboardVariantService(syncytium),
    ...createHierarchicalVariantService(syncytium)
  };
}

module.exports = { createVariantFacade };
