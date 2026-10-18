'use strict';

const roots = require('./roots');
const views = require('./views');
const leases = require('./leases');
const legacy = require('./legacy');
const workers = require('./workers');
const execution = require('./execution');
const workerPromotion = require('./workerPromotion');
const garbageCollection = require('./garbageCollection');
const rollout = require('./rollout');
const materialization = require('./materialization');
const { migrateGqwf } = require('./schema');

function createFabric(db, options = {}) {
  return {
    importBase: (input) => roots.importBase(db, input),
    importLegacySnapshot: (input) => legacy.importLegacySnapshot(db, input),
    createView: (input) => views.createView(db, input),
    listFiles: (input) => views.listFiles(db, input),
    readFile: (input) => views.readFile(db, input),
    writeFile: (input) => views.writeFile(db, input),
    deleteFile: (input) => views.deleteFile(db, input),
    sealView: (input) => views.sealView(db, input),
    mergeRoots: (input) => roots.mergeRoots(db, input),
    getHead: (input) => roots.getHead(db, input),
    initializeHead: (input) => roots.initializeHead(db, input),
    publishCandidate: (input) => roots.publishCandidate(db, input,
      { verifier: options.verifyPromotion }),
    inspectMaterializers: (input = {}) => leases.inspectMaterializers(db, input, options),
    inspectMaterialization: (input) => materialization.receiptForLease(db, input),
    materializeRoot: (input) => leases.materializeRoot(db, input, options),
    ingestLease: (input) => leases.ingestLease(db, input, options),
    releaseLease: (input) => leases.releaseLease(db, input, options),
    reconcileReleasingLeases: (input) => leases.reconcileReleasingLeases(db, input, options),
    inspectWorker: (input) => workers.inspectWorker(db, input),
    inspectWorkerCandidates: (input) => workerPromotion.candidatesForWorkers(db, input),
    promoteWorkerCandidate: (input) => workerPromotion.promoteWorkerCandidate(
      db, input, options.verifyWorkerPromotion),
    inspectGarbage: (input) => garbageCollection.inspectGarbage(db, input, options),
    collectGarbage: (input) => garbageCollection.collectGarbage(db, input, options),
    inspectRollout: (input) => rollout.inspectRollout(db, input),
    openExecutionWorkspace: (input) => execution.openExecutionWorkspace(db, input),
    materializeExecutionWorkspace: (input) => execution.materializeExecutionWorkspace(db, input, options),
    ingestExecutionWorkspace: (input) => execution.ingestExecutionWorkspace(db, input, options),
    releaseExecutionWorkspace: (input) => execution.releaseExecutionWorkspace(db, input, options)
  };
}

module.exports = { createFabric, migrateGqwf };
