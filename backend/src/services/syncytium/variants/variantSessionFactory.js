'use strict';

const CREATORS = Object.freeze({
  hard: ['./hard/hardVariantService', 'createHardVariantService', 'createHardSession'],
  soft: ['./soft/softVariantService', 'createSoftVariantService', 'createSoftSession'],
  document: ['./document/documentVariantService', 'createDocumentVariantService', 'createDocumentSession'],
  code: ['./code/codeVariantService', 'createCodeVariantService', 'createSession'],
  blackboard: ['./blackboard/blackboardVariantService', 'createBlackboardVariantService', 'createBlackboardSession'],
  graph: ['./graph/graphVariantService', 'createGraphVariantService', 'createGraphSession'],
  epistemic: ['./epistemic/epistemicVariantService', 'createEpistemicVariantService', 'createEpistemicSession'],
  transactional: ['./transactional/transactionalVariantService', 'createTransactionalVariantService', 'createTransactionalSession'],
  localFirst: ['./localFirst/localFirstVariantService', 'createLocalFirstVariantService', 'createLocalFirstSession'],
  speculative: ['./speculative/speculativeVariantService', 'createSpeculativeVariantService', 'createSpeculativeSession'],
  hierarchical: ['./hierarchical/hierarchicalVariantService', 'createHierarchicalVariantService', 'createHierarchicalSession'],
  realtimeControl: ['./realtime/realtimeControlVariantService', 'createRealtimeControlVariantService', 'createRealtimeControlSession'],
  humanAi: ['./humanAi/humanAiVariantService', 'createHumanAiVariantService', 'createHumanAiSession']
});

function createVariantSession(input) {
  const descriptor = CREATORS[input.policyId];
  if (!descriptor) throw Object.assign(new Error(`No runtime for variant '${input.policyId}'.`), { code: 'SYNCYTIUM_VARIANT_RUNTIME_UNKNOWN' });
  const [modulePath, factoryName, methodName] = descriptor;
  const service = require(modulePath)[factoryName](input.syncytium);
  return service[methodName](input.mission, input.options);
}

module.exports = { createVariantSession };
