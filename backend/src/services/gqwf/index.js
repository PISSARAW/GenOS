'use strict';

const roots = require('./roots');
const views = require('./views');
const leases = require('./leases');
const legacy = require('./legacy');
const workers = require('./workers');
const execution = require('./execution');
const workerPromotion = require('./workerPromotion');
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
    materializeRoot: (input) => leases.materializeRoot(db, input),
    ingestLease: (input) => leases.ingestLease(db, input),
    releaseLease: (input) => leases.releaseLease(db, input),
    reconcileReleasingLeases: (input) => leases.reconcileReleasingLeases(db, input),
    inspectWorker: (input) => workers.inspectWorker(db, input),
    inspectWorkerCandidates: (input) => workerPromotion.candidatesForWorkers(db, input),
    promoteWorkerCandidate: (input) => workerPromotion.promoteWorkerCandidate(
      db, input, options.verifyWorkerPromotion),
    openExecutionWorkspace: (input) => execution.openExecutionWorkspace(db, input),
    materializeExecutionWorkspace: (input) => execution.materializeExecutionWorkspace(db, input),
    ingestExecutionWorkspace: (input) => execution.ingestExecutionWorkspace(db, input),
    releaseExecutionWorkspace: (input) => execution.releaseExecutionWorkspace(db, input)
  };
}

module.exports = { createFabric, migrateGqwf };
