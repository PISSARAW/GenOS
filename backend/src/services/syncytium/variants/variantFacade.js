'use strict';

const { createGraphVariantService } = require('./graph/graphVariantService');
const { createTransactionalVariantService } = require('./transactional/transactionalVariantService');
const { createEpistemicVariantService } = require('./epistemic/epistemicVariantService');
const { createBlackboardVariantService } = require('./blackboard/blackboardVariantService');
const { createHierarchicalVariantService } = require('./hierarchical/hierarchicalVariantService');
const { createHumanAiVariantService } = require('./humanAi/humanAiVariantService');
const { createRoleServiceDirectory } = require('../runtime/roleServiceDirectory');
const { createVariantPolicyService } = require('./variantPolicyRegistry');
const { createNestedTopologyService } = require('../runtime/nestedTopologyService');
const { createMorphogenesisAdvisor } = require('../runtime/morphogenesisAdvisor');
const { createSyncytiumRuntime } = require('../runtime/syncytiumRuntime');

function createVariantFacade(syncytium) {
  return {
    ...createGraphVariantService(syncytium),
    ...createTransactionalVariantService(syncytium),
    ...createEpistemicVariantService(syncytium),
    ...createBlackboardVariantService(syncytium),
    ...createHierarchicalVariantService(syncytium),
    ...createHumanAiVariantService(syncytium),
    ...createRoleServiceDirectory(syncytium),
    ...createVariantPolicyService(syncytium),
    ...createNestedTopologyService(syncytium),
    ...createMorphogenesisAdvisor(syncytium),
    createAutonomousRuntime: (options) => createSyncytiumRuntime(syncytium, options || {})
  };
}

module.exports = { createVariantFacade };
