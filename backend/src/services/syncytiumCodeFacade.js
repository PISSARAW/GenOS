'use strict';

const { createCodeVariantService } = require('./syncytium/variants/code/codeVariantService');
const { createVariantFacade } = require('./syncytium/variants/variantFacade');

function createSyncytiumCodeFacade(dependencies) {
  const { createSession, applyOperation, snapshot, applyTransaction } = dependencies;

  const codeVariant = createCodeVariantService({ createSession, applyOperation, snapshot });

  const variantFacade = createVariantFacade({
    createSession, applyOperation, applyTransaction, snapshot,
    createSnapshot: dependencies.createSnapshot,
    listSnapshots: dependencies.listSnapshots,
    compactHistory: dependencies.compactHistory,
    explain: dependencies.explain,
    localizeFaults: dependencies.localizeFaults,
    chooseRepairCandidates: dependencies.chooseRepairCandidates,
    repairInvariant: dependencies.repairInvariant,
    inspectHistory: dependencies.inspectHistory,
    inspectConflicts: dependencies.inspectConflicts
  });

  return {
    createCodeSession: (mission, options = {}) => codeVariant.createSession(mission, options),
    applyCodeChange: (sessionId, change, options = {}) => codeVariant.applyChange(sessionId, change, options),
    recordCodeTestResult: (sessionId, result, options = {}) => codeVariant.recordTestResult(sessionId, result, options),
    recordCodeBuildState: (sessionId, build, options = {}) => codeVariant.recordBuildState(sessionId, build, options),
    codeSnapshot: (sessionId, options = {}) => codeVariant.snapshot(sessionId, options),
    acquireFileLock: (sessionId, request, options = {}) => codeVariant.acquireFileLock(sessionId, request, options),
    releaseFileLock: (sessionId, request, options = {}) => codeVariant.releaseFileLock(sessionId, request, options),
    verifyMergeGate: (sessionId, request, options = {}) => codeVariant.verifyMergeGate(sessionId, request, options),
    ...variantFacade
  };
}

module.exports = { createSyncytiumCodeFacade };