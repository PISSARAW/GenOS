'use strict';

const topologyTrinityHandler = require('../../../bin/topologyTrinityHandler.cjs');
const { ensureParent } = require('./parentEnsurer.cjs');
const workerGarage = require('../workerGarageService.js');
const { buildNCEEnrichments } = require('./nceEnrichmentBuilder.cjs');
const { createOrchestratorId, launchWorker } = require('./workerLauncher.cjs');

async function handleTrinity(db, context) {
  return topologyTrinityHandler.handle({ db, context, ensureParent, workerGarage, buildNCEEnrichments, createOrchestratorId, launchWorker });
}

module.exports = { handleTrinity };