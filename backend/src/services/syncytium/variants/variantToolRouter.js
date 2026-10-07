'use strict';

const ACTIONS = Object.freeze({
  hard: ['acquireHardFence', 'releaseHardFence', 'recoverExpiredFence', 'runFencedTransaction'],
  soft: ['applyDelta', 'reconcileAntiEntropy', 'compressState', 'setStalenessBudget', 'getStalenessBudget', 'simulatePartition', 'listDeltas', 'softSnapshot'],
  document: ['insertDocumentBlock', 'updateDocumentBlock', 'deleteDocumentBlock', 'addDocumentComment', 'retractDocumentComment', 'undoDocumentOperation', 'documentSnapshot'],
  code: ['applyCodeChange', 'recordCodeTestResult', 'recordCodeBuildState', 'acquireFileLock', 'releaseFileLock', 'verifyMergeGate', 'codeSnapshot'],
  blackboard: ['postProblem', 'postEvidence', 'requestVerification', 'reportUnresolvedDependency', 'publishBlackboardResult', 'readBlackboard'],
  graph: ['addGraphNode', 'updateGraphNode', 'removeGraphNode', 'addGraphEdge', 'removeGraphEdge', 'graphSnapshot', 'projectGraph'],
  epistemic: ['addEpistemicClaim', 'addEpistemicEvidence', 'addEpistemicRefutation', 'recordEpistemicUncertainty', 'verifyEpistemicClaim', 'updateEpistemicConfidence', 'epistemicSnapshot'],
  transactional: ['reserveResources', 'releaseReservation', 'sweepExpiredReservations', 'detectReservationDeadlock', 'transactionalSnapshot'],
  localFirst: ['recordHybridClock', 'syncPeer', 'partitionOffline', 'reconcileQueue', 'checkOfflineBudget', 'listReplicas', 'localFirstSnapshot'],
  speculative: ['spawnBranch', 'executeOnBranch', 'compareBranches', 'promoteBranch', 'discardBranch', 'listBranches', 'speculativeSnapshot'],
  hierarchical: ['applyRegionalOperation', 'applyRegionalTransaction', 'reconcileRegionalBoundary', 'setRegionalFirebreak', 'regionalSnapshot'],
  realtimeControl: ['recordWcetEvidence', 'executeControlCycle', 'checkControlWatchdog', 'planControlSchedule'],
  humanAi: ['updateHumanPresence', 'acquireHumanLease', 'releaseHumanLease', 'addHumanComment', 'submitHumanApproval', 'setHumanConsent', 'setHumanPause', 'undoHumanAction', 'executeApprovedAction', 'humanAiSnapshot']
});

const CONTEXT_VARIANTS = new Set(['soft', 'localFirst', 'speculative']);
const THREE_ARG_INPUTS = Object.freeze({
  applyCodeChange: 'change', recordCodeTestResult: 'result',
  recordCodeBuildState: 'build', projectGraph: 'query'
});
const DIRECT_OPTIONS = new Set(['documentSnapshot', 'codeSnapshot', 'readBlackboard', 'graphSnapshot', 'epistemicSnapshot', 'transactionalSnapshot', 'humanAiSnapshot']);

async function executeVariantAction(input) {
  const { db, record, sessionId, action, request } = input;
  const variantId = record.state?.variantPolicy?.id;
  if (record.state?.variantPolicy?.runtimeMode !== 'specialized' || !ACTIONS[variantId]?.includes(action)) {
    throw Object.assign(new Error(`Action '${action}' is not available for this variant session.`), { code: 'SYNCYTIUM_VARIANT_ACTION_DENIED' });
  }
  const service = require('../../syncytiumCoordinationService');
  if (typeof service[action] !== 'function') throw new Error(`Variant action '${action}' is unavailable.`);
  return routeVariantAction({ db, sessionId, action, request, variantId, service });
}

function contextRequest(input) {
  const { db, sessionId, variantId, request } = input;
  if (variantId === 'localFirst' || variantId === 'speculative') {
    return { ...request, sid: sessionId, o: { ...(request.o || {}), db } };
  }
  return { ...request, sessionId, options: { ...(request.options || {}), db } };
}

module.exports = { executeVariantAction, ACTIONS };

function routeDirectVariantAction(context) {
  const { sessionId, action, request, service } = context;
  if (DIRECT_OPTIONS.has(action)) return service[action](sessionId, { ...request, db: context.db });
  return service[action](sessionId, { ...request, options: { ...(request.options || {}), db: context.db } });
}

function routeShapedVariantAction(context) {
  const { sessionId, action, request, service } = context;
  if (THREE_ARG_INPUTS[action]) {
    const input = request[THREE_ARG_INPUTS[action]] || request;
    return service[action](sessionId, input, { ...(request.options || {}), db: context.db });
  }
  return routeDirectVariantAction(context);
}

function routeContextVariantAction(context) {
  const { db, sessionId, action, request, variantId, service } = context;
  if (CONTEXT_VARIANTS.has(variantId)) return service[action](contextRequest({ db, sessionId, variantId, request }));
  return routeShapedVariantAction({ db, sessionId, action, request, service });
}

function routeVariantAction({ db, sessionId, action, request, variantId, service }) {
  if (action === 'detectReservationDeadlock') return service[action](request.waitEdges || []);
  if (action === 'planControlSchedule') return service[action](request.jobs || []);
  return routeContextVariantAction({ db, sessionId, action, request, variantId, service });
}
