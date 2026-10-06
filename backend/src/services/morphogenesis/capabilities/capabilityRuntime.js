'use strict';

const artifacts = require('./runtimeArtifacts');
const waves = require('./experimentWaveRuntime');
const spiral = require('./spiralRuntime');
const memory = require('./cambiumService');
const memoryLifecycle = require('./cambiumLifecycle');
const lineage = require('./riskLineage');
const statistics = require('./statisticalProvenance');
const probes = require('./residentProbeRuntime');
const schedules = require('../../ontogenesis/scheduleService');

const OPERATIONS = Object.freeze({
  'artifact.put': artifacts.put, 'artifact.get': artifacts.get,
  'meristem.open': waves.openWave, 'meristem.seal': waves.sealWave,
  'meristem.seal-scientific': require('./trinityMeristemBridge').sealScientificWave,
  'spiral.plan': spiral.plan, 'spiral.finish': spiral.finish,
  'cambium.register': memory.registerProcedure, 'cambium.counterexample': memory.attachCounterexample,
  'cambium.compress': memory.commitCompression, 'cambium.context': memory.loadClaimContext,
  'cambium.link': memoryLifecycle.link, 'cambium.invalidate': memoryLifecycle.invalidate,
  'risk.create': lineage.createScope, 'risk.fork': lineage.fork, 'risk.merge': lineage.merge,
  'risk.lifecycle': lineage.lifecycle, 'risk.reserve': lineage.reserveNext, 'risk.promote': lineage.promotion,
  'risk.protocol': statistics.registerProtocol, 'risk.receipt': statistics.issueVerifiedReceipt,
  'chronotaxis.create': schedules.createSchedule, 'chronotaxis.coverage': schedules.temporalCoverage,
  'chronotaxis.aggregate': probes.aggregate
});

async function invoke(db, input) {
  const operation = OPERATIONS[input.operation];
  if (!operation || !input.scopeId) throw new Error('CAPABILITY_OPERATION_AND_SCOPE_REQUIRED');
  return operation(db, { ...input, resolveArtifact: artifacts.resolver(db, input.scopeId) });
}

module.exports = { invoke, OPERATIONS: Object.keys(OPERATIONS) };
