'use strict';

const { createGraphVariantService } = require('./graph/graphVariantService');
const { createTransactionalVariantService } = require('./transactional/transactionalVariantService');
const { createEpistemicVariantService } = require('./epistemic/epistemicVariantService');
const { createBlackboardVariantService } = require('./blackboard/blackboardVariantService');
const { createHierarchicalVariantService } = require('./hierarchical/hierarchicalVariantService');
const { createHumanAiVariantService } = require('./humanAi/humanAiVariantService');
const { createHardVariantService } = require('./hard/hardVariantService');
const { createDocumentVariantService } = require('./document/documentVariantService');
const { createSoftVariantService } = require('./soft/softVariantService');
const { createLocalFirstVariantService } = require('./localFirst/localFirstVariantService');
const { createSpeculativeVariantService } = require('./speculative/speculativeVariantService');
const { createAntiEntropyService } = require('../sync/antiEntropyService');
const { createRealtimeControlVariantService } = require('./realtime/realtimeControlVariantService');
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
    ...createHardVariantService(syncytium),
    ...createDocumentVariantService(syncytium),
    ...createSoftVariantService(syncytium),
    ...createLocalFirstVariantService(syncytium),
    ...createSpeculativeVariantService(syncytium),
    ...createAntiEntropyService(syncytium),
    ...createRealtimeControlVariantService(syncytium),
    ...createRoleServiceDirectory(syncytium),
    ...createVariantPolicyService(syncytium),
    ...createNestedTopologyService(syncytium),
    ...createMorphogenesisAdvisor(syncytium),
    createAutonomousRuntime: (options) => createSyncytiumRuntime(syncytium, options || {}),
    inspectHistory: syncytium.inspectHistory,
    inspectConflicts: syncytium.inspectConflicts
  };
}

module.exports = { createVariantFacade };
