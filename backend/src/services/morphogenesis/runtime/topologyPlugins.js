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
    return controller.execute(inputFrom(context));
  };
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
  const input = inputFrom(context);
  const individuals = individualsFrom(args, input);
  const ecology = buildBiomeEcology(individuals);
  const actions = [];
  actions.push(await popRuntime.execute(ecology, { type: 'create', population: { populationId: 'pop-mission', nicheId: 'niche-mission' } }));
  if (individuals.length > 0) {
    actions.push(await popRuntime.execute(ecology, { type: 'spawn', populationId: 'pop-mission', individuals }));
  }
  actions.push(await popRuntime.execute(ecology, { type: 'advance', populationId: 'pop-mission', measurements: measurementsFrom(input) }));
  return { ecology: summarizeEcology(ecology), actions: actions.map((result) => result && result.action) };
}

function individualsFrom(args, input) {
  const fromWorkers = (args.workers || []).map(workerToIndividual).filter(Boolean);
  const fromInput = Array.isArray(input.individuals) ? input.individuals : [];
  return [...fromWorkers, ...fromInput];
}

function workerToIndividual(worker) {
  if (!worker || typeof worker !== 'object') return null;
  const id = worker.id || worker.individualId;
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
  const input = inputFrom(context);
  const capability = capabilityFrom(input);
  const executeCapability = capabilityExecutorFrom(input);
  const { createRuntimeDb } = require('./sqliteDb');
  const created = await createRuntimeDb();
  try {
    await migrateHolobionte(created.db);
    const session = await provisionHolobiont(created.db, { args, input, capability });
    const runtime = require('../../holobionte/runtime/holobiontRuntime');
    const result = await runtime.runCycle(created.db, cycleInput(session, { input, capability, executeCapability }), {});
    return { ...result, driver: created.driver };
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

async function migrateHolobionte(db) {
  const sessions = require('../../../db/migrations/migrateHolobiontSessions');
  const contracts = require('../../../db/migrations/migrateHolobiontContracts');
  const memory = require('../../../db/migrations/migrateHolobiontMemory');
  const ledger = require('../../../db/migrations/migrateHolobiontLedger');
  const immune = require('../../../db/migrations/migrateHolobiontImmunePlane');
  await sessions.migrateHolobiontSessions(db);
  await contracts.migrateHolobiontContracts(db);
  await memory.migrateHolobiontMemory(db);
  await ledger.migrateHolobiontLedger(db);
  await immune.migrateHolobiontImmunePlane(db);
}

async function provisionHolobiont(db, setup) {
  const { args, input, capability } = setup;
  const store = require('../../holobionte/holobiontStore');
  const constitution = require('../../holobionte/host/hostConstitutionService');
  const contracts = require('../../holobionte/contracts/symbiosisContractService');
  const created = await store.createSession(db, sessionInput(args, input));
  const holobiontId = created.holobiontId;
  const hostConstitution = constitution.createHostConstitution({ hostId: created.hostId, identity: created.hostId });
  await constitution.updateConstitution(db, { holobiontId, constitution: hostConstitution, expectedRevision: await revisionOf(store, db, holobiontId) });
  await store.appendEvent(db, { holobiontId, expectedRevision: await revisionOf(store, db, holobiontId), eventType: 'SYMBIONT_DISCOVERED', payload: { symbiontId: 'resident-mission', symbiont: { capabilities: [capability] } } });
  await contracts.createContract(db, { holobiontId, expectedSessionRevision: await revisionOf(store, db, holobiontId), contract: contractBody(created, capability) });
  await store.appendEvent(db, { holobiontId, expectedRevision: await revisionOf(store, db, holobiontId), eventType: 'SYMBIONT_ADMITTED', payload: { symbiontId: 'resident-mission', receipt: { receiptId: 'morphogenesis-admission' } } });
  return store.getSession(db, holobiontId);
}

async function revisionOf(store, db, holobiontId) {
  const session = await store.getSession(db, holobiontId);
  return session.revision;
}

function sessionInput(args, input) {
  return { hostId: hostFrom(args, input), missionId: missionFrom(args, input), constitution: null };
}

function hostFrom(args, input) {
  return input.hostId || (args.workers[0] && (args.workers[0].id || args.workers[0].individualId)) || 'morphogenesis-host';
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

function cycleInput(session, invocation) {
  const { input, capability, executeCapability } = invocation;
  return {
    holobiontId: session.holobiontId,
    capability,
    missionId: session.missionId,
    allocation: input.allocation,
    actorId: input.actorId || 'morphogenesis-runtime',
    executeCapability
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
  const input = inputFrom(context);
  const mission = missionTextFrom(args, input, context);
  const { createRuntimeDb } = require('./sqliteDb');
  const created = await createRuntimeDb();
  try {
    await migrateMetapopulation(created.db);
    const coordination = require('../../metapopulationCoordinationService');
    const session = await coordination.createMetapopulationSession(mission, sessionOptions(args, input, created.db));
    const brain = require('../../metapopulation/runtime/regionalBrainService');
    const result = await brain.runAutonomousRegionalRuntime({ metapopulationId: session.metapopulationId, maxCycles: 1 }, { db: created.db });
    return { ...result, driver: created.driver };
  } finally {
    await created.close();
  }
}

function missionTextFrom(args, input, context) {
  const mission = String(input.mission || input.missionText || args.mission || (context && context.missionId) || '').trim();
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

function inputFrom(context) {
  if (context.input && typeof context.input === 'object') return context.input;
  return {};
}

module.exports = { PLUGIN_TOPOLOGIES, UNSUPPORTED_TOPOLOGIES, installTopologyPlugins };
