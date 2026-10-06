'use strict';

const { ControllerRegistry } = require('../controllers/registry');

const CONTROLLER_TOPOLOGIES = Object.freeze(['trinity', 'a_team', 'rhizome', 'syncytium', 'biocenose']);
const SERVICE_TOPOLOGIES = Object.freeze(['biome', 'holobionte', 'metapopulation']);
const PLUGIN_TOPOLOGIES = Object.freeze([...CONTROLLER_TOPOLOGIES, ...SERVICE_TOPOLOGIES]);
const UNSUPPORTED_TOPOLOGIES = Object.freeze([]);

function installTopologyPlugins(runtime) {
  const registry = new ControllerRegistry(runtime);
  for (const topology of CONTROLLER_TOPOLOGIES) installController(runtime, registry, topology);
  installBiome(runtime);
  installHolobionte(runtime);
  installMetapopulation(runtime);
  return { installed: [...PLUGIN_TOPOLOGIES], unsupported: [...UNSUPPORTED_TOPOLOGIES], registry };
}

function installController(runtime, registry, topology) {
  runtime.registerTopology(topology, { topology, run: runWithController(registry, topology) });
}

function runWithController(registry, topology) {
  return async function run(args, context) {
    const node = nodeFrom(args, topology, context);
    const controller = registry.getController(topology, node);
    await controller.compose({ variant: args.variant });
    const input = inputFrom(context, args);
    const workerResults = require('./topologyWorkerResults').collectTopologyWorkerResults(node.workers, input);
    const output = await controller.execute({ ...input, workers: node.workers, workerResults });
    return attachWorkerResults(output, workerResults);
  };
}

function attachWorkerResults(output, workerResults) {
  if (output && typeof output === 'object' && !Array.isArray(output)) return { ...output, workerResults };
  return { topologyOutput: output, workerResults };
}

function installBiome(runtime) {
  runtime.registerTopology('biome', { topology: 'biome', run: runBiome });
}

async function runBiome(args, context) {
  try {
    return await executeBiome(args, context);
  } catch (err) {
    throw serviceError('biome', err);
  }
}

async function executeBiome(args, context) {
  const popRuntime = require('../../biome/populations/populationRuntimeService');
  const input = inputFrom(context, args);
  const workerResults = collectMissionWorkers(args, input);
  const individuals = individualsFrom(args, input);
  const ecology = buildBiomeEcology(individuals);
  const actions = [];
  actions.push(await popRuntime.execute(ecology, { type: 'create', population: { populationId: 'pop-mission', nicheId: 'niche-mission' } }));
  if (individuals.length > 0) {
    actions.push(await popRuntime.execute(ecology, { type: 'spawn', populationId: 'pop-mission', individuals }));
  }
  actions.push(await popRuntime.execute(ecology, { type: 'advance', populationId: 'pop-mission', measurements: measurementsFrom(input) }));
  return { ecology: summarizeEcology(ecology), actions: actions.map((result) => result && result.action), workerResults };
}

function individualsFrom(args, input) {
  const fromWorkers = (args.workers || []).map(workerToIndividual).filter(Boolean);
  const fromInput = Array.isArray(input.individuals) ? input.individuals : [];
  return [...fromWorkers, ...fromInput];
}

function workerToIndividual(worker) {
  if (!worker || typeof worker !== 'object') return null;
  const id = worker.workerId || worker.agentId || worker.id || worker.individualId;
  if (!id) return null;
  return { individualId: String(id), capabilities: worker.capabilities || [] };
}

function buildBiomeEcology(individuals) {
  return {
    niches: [{ nicheId: 'niche-mission', status: 'open', carryingCapacity: Math.max(1, individuals.length), requiredCapabilities: [] }],
    populations: [],
    ecologicalState: {}
  };
}

function measurementsFrom(input) {
  return input.measurements || { productivity: 1 };
}

function summarizeEcology(ecology) {
  const populations = ecology.populations || [];
  return {
    niches: (ecology.niches || []).length,
    populations: populations.length,
    individuals: populations.reduce((sum, pop) => sum + (pop.individuals || []).length, 0)
  };
}

function installHolobionte(runtime) {
  runtime.registerTopology('holobionte', { topology: 'holobionte', run: runHolobionte });
}

async function runHolobionte(args, context) {
  try {
    return await executeHolobionte(args, context);
  } catch (err) {
    throw serviceError('holobionte', err);
  }
}

async function executeHolobionte(args, context) {
  const input = inputFrom(context, args);
  if (input.variantId && Array.isArray(input.variantOperations)) return executeVariantMission(args, input);
  const workerResults = collectMissionWorkers(args, input);
  const capability = capabilityFrom(input);
  const executeCapability = capabilityExecutorFrom(input);
  const trialCapabilityExecutor = trialExecutorFrom(input);
  const created = await require('./sqliteDb').createRuntimeDb({ db: input.db });
  try {
    const result = await require('../../holobionte/runtime/holobiontMissionService').runHolobiontMission(created.db, {
      ...input, hostId: hostFrom(args, input), missionId: missionFrom(args, input), capability,
      executeCapability, trialCapabilityExecutor, workerResults,
      symbionts: input.symbionts || [{ id: 'resident-mission', contract: contractBody({ hostId: hostFrom(args, input) }, capability) }]
    });
    return { ...result, driver: created.driver, workerResults };
  } finally {
    await created.close();
  }
}

function capabilityFrom(input) {
  const capability = String(input.capability || '').trim();
  if (!capability) throw new Error('holobionte requires input.capability');
  return capability;
}

function capabilityExecutorFrom(input) {
  if (typeof input.executeCapability !== 'function') {
    throw new Error('holobionte requires input.executeCapability (mission-provided capability executor)');
  }
  return input.executeCapability;
}

function trialExecutorFrom(input) {
  if (typeof input.trialCapabilityExecutor !== 'function') {
    throw Object.assign(new Error('holobionte requires an isolated trial capability executor.'), {
      code: 'HOLOBIONT_TRIAL_EXECUTOR_REQUIRED'
    });
  }
  return input.trialCapabilityExecutor;
}

async function migrateHolobionte(db) {
  const sessions = require('../../../db/migrations/migrateHolobiontSessions');
  const contracts = require('../../../db/migrations/migrateHolobiontContracts');
  const memory = require('../../../db/migrations/migrateHolobiontMemory');
  const ledger = require('../../../db/migrations/migrateHolobiontLedger');
  const immune = require('../../../db/migrations/migrateHolobiontImmunePlane');
  const variantEvents = require('../../../db/migrations/migrateHolobiontVariantEvents');
  await sessions.migrateHolobiontSessions(db);
  await contracts.migrateHolobiontContracts(db);
  await memory.migrateHolobiontMemory(db);
  await ledger.migrateHolobiontLedger(db);
  await immune.migrateHolobiontImmunePlane(db);
  await variantEvents.migrateHolobiontVariantEvents(db);
}

async function executeVariantMission(args, input) {
  const { db, close, driver } = await require('./sqliteDb').createRuntimeDb({ db: input.db });
  try {
    await migrateHolobionte(db);
    const result = await require('../../holobionte/variants/variantMissionExecutor')
      .runVariantMission(db, { ...input, variantId: args.variant, missionId: missionFrom(args, input) });
    return { ...result, driver };
  } finally {
    await close();
  }
}

function hostFrom(args = {}, input = {}) {
  const workers = Array.isArray(args.workers) ? args.workers : [];
  return input.hostId || (workers[0] && (workers[0].id || workers[0].individualId)) || 'morphogenesis-host';
}

function missionFrom(args, input) {
  return input.missionId || input.mission || args.mission || 'morphogenesis-mission';
}

function contractBody(created, capability) {
  return {
    hostId: created.hostId, symbiontId: 'resident-mission', capabilitiesOffered: [capability],
    dependencyCeiling: 0.3, resourcesRequested: { tokens: 20 }, inputs: {}, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: [capability] }, toolLeases: [], dataAccess: [],
    privacyBoundary: {}, evidenceRequirements: [`${capability}-proof`], expectedBenefit: { quality: 'higher' },
    maxCost: { tokens: 20 }, immunePolicy: {}, adaptationPolicy: {},
    transmissionPolicy: 'NEVER_INHERIT', terminationConditions: ['mission-end']
  };
}

function installMetapopulation(runtime) {
  runtime.registerTopology('metapopulation', { topology: 'metapopulation', run: runMetapopulation });
}

async function runMetapopulation(args, context) {
  try {
    return await executeMetapopulation(args, context);
  } catch (err) {
    throw serviceError('metapopulation', err);
  }
}

async function executeMetapopulation(args, context) {
  const input = inputFrom(context, args);
  const workerResults = collectMissionWorkers(args, input);
  const mission = missionTextFrom(args, input, context);
  const { createRuntimeDb } = require('./sqliteDb');
  const created = await createRuntimeDb();
  try {
    await migrateMetapopulation(created.db);
    const coordination = require('../../metapopulationCoordinationService');
    const session = await coordination.createMetapopulationSession(mission, sessionOptions(args, input, created.db));
    const brain = require('../../metapopulation/runtime/regionalBrainService');
    const result = await brain.runAutonomousRegionalRuntime({ metapopulationId: session.metapopulationId, maxCycles: 1 }, { db: created.db, workerResults });
    return { ...result, driver: created.driver, workerResults };
  } finally {
    await created.close();
  }
}

function collectMissionWorkers(args, input) {
  return require('./topologyWorkerResults').collectTopologyWorkerResults(args.workers || [], input);
}

function missionTextFrom(args, input, context) {
  const mission = String(input.mission || input.missionText || args.mission || '').trim();
  if (!mission) throw new Error('metapopulation requires a mission text (input.mission)');
  return mission;
}

function sessionOptions(args, input, db) {
  return { db, missionId: input.missionId || args.mission, actor: input.actorId || 'morphogenesis-runtime' };
}

async function migrateMetapopulation(db) {
  const base = require('../../../db/migrations/migrateMetapopulation');
  const runtime = require('../../../db/migrations/migrateMetapopulationRuntime');
  const variants = require('../../../db/migrations/migrateMetapopulationVariantRuntime');
  await base.migrateMetapopulation(db);
  await runtime.migrateMetapopulationRuntime(db);
  await variants.migrateMetapopulationVariantRuntime(db);
}

function serviceError(topology, err) {
  if (err && (err.code === 'ERR_DLOPEN_FAILED' || String(err.message || '').includes('node_sqlite3'))) {
    return new Error(`${topology} requires a sqlite-capable runtime environment (native binding unavailable)`, { cause: err });
  }
  return err;
}

function nodeFrom(args, topology, context) {
  return {
    nodeId: context.nodeId || topology,
    topology,
    variant: args.variant || null,
    workers: args.workers || [],
    budget: context.budget || {},
    health: null,
    state: context.state || {}
  };
}

function inputFrom(context, args = {}) {
  const input = context.input && typeof context.input === 'object' ? context.input : {};
  return { ...input, variantId: args.variant || input.variantId || null,
    workers: Array.isArray(args.workers) ? args.workers : input.workers || [] };
}

module.exports = { PLUGIN_TOPOLOGIES, UNSUPPORTED_TOPOLOGIES, installTopologyPlugins, hostFrom, missionTextFrom };
