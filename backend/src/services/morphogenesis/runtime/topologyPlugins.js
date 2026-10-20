'use strict';

const { ControllerRegistry } = require('../controllers/registry');
const { createTopologyRuntimePort } = require('./topologyRuntimePort');

const CONTROLLER_TOPOLOGIES = Object.freeze(['trinity', 'a_team', 'rhizome', 'syncytium', 'biocenose']);
const SERVICE_TOPOLOGIES = Object.freeze(['biome', 'holobionte', 'metapopulation']);
const PLUGIN_TOPOLOGIES = Object.freeze([...CONTROLLER_TOPOLOGIES, ...SERVICE_TOPOLOGIES]);
const UNSUPPORTED_TOPOLOGIES = Object.freeze([]);

function installTopologyPlugins(runtime) {
  const registry = new ControllerRegistry(runtime);
  const ports = new Map();
  for (const topology of CONTROLLER_TOPOLOGIES) installController({ runtime, registry, ports, topology });
  installBiome(runtime, ports);
  installHolobionte(runtime, ports);
  installMetapopulation(runtime, ports);
  return { installed: [...PLUGIN_TOPOLOGIES], unsupported: [...UNSUPPORTED_TOPOLOGIES],
    ports: Object.fromEntries(ports), registry };
}

function installController(input) {
  const { runtime, registry, ports, topology } = input;
  if (topology === 'rhizome' && runtime.rhizomeRestoration) {
    return installRhizomeRestoration(input);
  }
  const executionKind = topology === 'syncytium' ? 'simulation_adapter' : 'hybrid_adapter';
  registerPort(runtime, ports, {
    topology, executionKind, execute: executeController(registry, topology),
    morphogenesis: controllerMorphogenesis(topology)
  });
}

function installRhizomeRestoration(input) {
  const factory = require('./rhizomeRestorationPort');
  const port = factory.createRhizomeRestorationPort({ ...input.runtime.rhizomeRestoration,
    execute: executeController(input.registry, 'rhizome') });
  input.ports.set('rhizome', port);
  input.runtime.registerTopology('rhizome', port);
}

function executeController(registry, topology) {
  const run = runWithController(registry, topology);
  return ({ args, context }) => run(args, context);
}

function registerPort(runtime, ports, definition) {
  const port = createTopologyRuntimePort(definition);
  ports.set(definition.topology, port);
  runtime.registerTopology(definition.topology, port);
}

function controllerMorphogenesis(topology) {
  const persistent = ['rhizome', 'biocenose'].includes(topology);
  return {
    observe: 'declared', adapt: 'declared', quiesce: 'declared',
    snapshot: persistent ? 'declared' : 'unknown',
    restore: persistent ? 'unknown' : 'unsupported', finalize: 'unknown'
  };
}

function serviceMorphogenesis(topology) {
  return {
    observe: 'declared', adapt: 'declared', quiesce: 'declared',
    snapshot: topology === 'biome' ? 'unknown' : 'declared',
    restore: 'unknown', finalize: 'declared'
  };
}

function runWithController(registry, topology) {
  return async function run(args, context) {
    const node = nodeFrom(args, topology, context);
    const controller = registry.getController(topology, node);
    const input = inputFrom(context, args);
    await controller.compose({ ...input, ...args, variant: args.variant, workers: node.workers });
    const workerResults = require('./topologyWorkerResults').collectTopologyWorkerResults(node.workers, input);
    const output = await controller.start({ ...input, workers: node.workers, workerResults });
    return attachWorkerResults(output, workerResults);
  };
}

function attachWorkerResults(output, workerResults) {
  if (output && typeof output === 'object' && !Array.isArray(output)) return { ...output, workerResults };
  return { topologyOutput: output, workerResults };
}

function installBiome(runtime, ports) {
  registerPort(runtime, ports, { topology: 'biome', executionKind: 'canonical_service',
    execute: ({ args, context }) => runBiome(args, context), morphogenesis: serviceMorphogenesis('biome') });
}

async function runBiome(args, context) {
  try {
    return await executeBiome(args, context);
  } catch (err) {
    throw serviceError('biome', err);
  }
}

async function executeBiome(args, context) {
  const result = await require('../../biome/biomeTopologyMission').execute(args, context);
  return { ...result, executionMode: 'service_runtime' };
}

function installHolobionte(runtime, ports) {
  registerPort(runtime, ports, { topology: 'holobionte', executionKind: 'canonical_service',
    execute: ({ args, context }) => runHolobionte(args, context),
    morphogenesis: serviceMorphogenesis('holobionte') });
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
  const adapters = missionAdapters(input, workerResults);
  const created = await require('./sqliteDb').createRuntimeDb({ db: input.db });
  try {
    const result = await require('../../holobionte/runtime/holobiontMissionService').runHolobiontMission(created.db, {
      ...input, hostId: hostFrom(args, input), missionId: missionFrom(args, input), capability,
      ...adapters, workerResults,
      symbionts: input.symbionts || [{ id: 'resident-mission', contract: contractBody({ hostId: hostFrom(args, input) }, capability) }]
    });
    return { ...result, driver: created.driver, workerResults, executionMode: 'service_runtime' };
  } finally {
    await created.close();
  }
}

function capabilityFrom(input) {
  const capability = String(input.capability || '').trim();
  if (!capability) throw new Error('holobionte requires input.capability');
  return capability;
}

function missionAdapters(input, workerResults) {
  const workerExecutor = workerCapabilityExecutor(workerResults);
  const executeCapability = input.executeCapability || workerExecutor;
  const verifyCapability = input.verifyCapability || workerCapabilityVerifier(workerResults);
  const trialCapabilityExecutor = input.trialCapabilityExecutor
    || (input.executeCapability ? undefined : workerExecutor);
  return { executeCapability, verifyCapability, trialCapabilityExecutor };
}

function workerCapabilityExecutor(results) {
  return async function executeFromWorkerReceipt() {
    const worker = results.find((item) => measuredCapability(item.evidenceReport));
    if (!worker) throw workerAdapterError('No worker result carries measured capability evidence.');
    const report = worker.evidenceReport;
    const measured = measuredCapability(report);
    return { result: report.workerArtifact.content,
      resourcesConsumed: measured.usage, contributionScore: measured.contributionScore,
      contractCompliant: measured.contractCompliant,
      unsafeBehavior: measured.unsafeBehavior, riskScore: measured.riskScore };
  };
}

function workerCapabilityVerifier(results) {
  return async function verifyFromWorkerReceipt(invocation) {
    const worker = results.find((item, index) => index > 0
      && evidenceRefs(item.evidenceReport).length > 0);
    if (!worker) throw workerAdapterError('No independent worker verification receipt is available.');
    return { status: 'VERIFIED', verifierId: worker.workerId,
      resultHash: invocation.resultHash, evidenceRefs: evidenceRefs(worker.evidenceReport) };
  };
}

function measuredUsage(report) {
  const usage = report?.usage || report?.workerArtifact?.provenance?.usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const normalized = Object.fromEntries(Object.entries(usage)
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0)
    .map(([key, value]) => [key, Number(value)]));
  return Object.keys(normalized).length ? normalized : null;
}

function measuredCapability(report) {
  const usage = measuredUsage(report);
  const metrics = report?.metrics || report?.workerArtifact?.provenance?.metrics;
  if (!usage || !metrics || typeof metrics !== 'object') return null;
  const contributionScore = Number(metrics.contributionScore);
  const riskScore = Number(metrics.riskScore);
  if (!Number.isFinite(contributionScore) || !Number.isFinite(riskScore)
    || typeof metrics.contractCompliant !== 'boolean'
    || typeof metrics.unsafeBehavior !== 'boolean') return null;
  return { usage, contributionScore, riskScore,
    contractCompliant: metrics.contractCompliant,
    unsafeBehavior: metrics.unsafeBehavior };
}

function evidenceRefs(report) {
  const provenance = report?.workerArtifact?.provenance || {};
  const refs = provenance.evidenceRefs || provenance.sourceRefs || [];
  return refs.filter((item) => typeof item === 'string' && item.trim());
}

function workerAdapterError(message) {
  return Object.assign(new Error(message), { code: 'HOLOBIONT_WORKER_ADAPTER_REQUIRED' });
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
    return { ...result, driver, executionMode: 'service_runtime' };
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

function installMetapopulation(runtime, ports) {
  registerPort(runtime, ports, { topology: 'metapopulation', executionKind: 'canonical_service',
    execute: ({ args, context }) => runMetapopulation(args, context),
    morphogenesis: serviceMorphogenesis('metapopulation') });
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
  const created = await createRuntimeDb({ db: input.db });
  try {
    await migrateMetapopulation(created.db);
    const coordination = require('../../metapopulationCoordinationService');
    const session = input.metapopulationId
      ? await coordination.getMetapopulationSession(input.metapopulationId, { db: created.db })
      : await coordination.createMetapopulationSession(mission, sessionOptions(args, input, created.db));
    if (input.variantId && session.variant !== require('../../metapopulation/policy/metapopulationPolicyService')
      .resolveMetapopulationVariant({ variant: input.variantId }).variant) {
      throw Object.assign(new Error('Requested variant differs from the persisted regional session.'),
        { code: 'METAPOPULATION_VARIANT_MISMATCH' });
    }
    if (!session.demes.length) return { status: 'BLOCKED', reason: 'REGION_UNPOPULATED',
      complete: false, missionVerified: false, sessionId: session.sessionId,
      variant: session.variant, driver: created.driver, workerResults,
      executionMode: 'service_runtime' };
    const brain = require('../../metapopulation/runtime/regionalBrainService');
    const result = await brain.runAutonomousRegionalRuntime({ ...input,
      metapopulationId: session.metapopulationId, maxCycles: input.maxCycles ?? 100 },
    { db: created.db, workerResults });
    const terminal = ['NO_ACTION', 'STOPPED'].includes(result.status);
    const verification = typeof input.verifyMission === 'function'
      ? await input.verifyMission({ mission, session, result, workerResults }) : null;
    const missionVerified = verification?.verified === true
      && Array.isArray(verification.evidenceRefs) && verification.evidenceRefs.length > 0;
    return { ...result, complete: terminal, missionVerified,
      sessionId: session.sessionId, variant: session.variant, driver: created.driver, workerResults,
      executionMode: 'service_runtime' };
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
  return { db, missionId: input.missionId || undefined, variant: input.variantId || args.variant,
    orchestratorId: input.actorId || undefined, actor: input.actorId || 'morphogenesis-runtime' };
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
  const input = objectValue(context.input);
  return { ...input, riskNodeId: context.nodeId,
    statisticalContract: firstValue(context.statisticalContracts?.[context.nodeId], input.statisticalContract),
    db: firstValue(context.capabilityDb, input.db),
    variantId: firstValue(args.variant, input.variantId, null),
    budget: firstValue(input.budget, context.budget, null),
    executionBudget: firstValue(input.executionBudget, context.budget, null),
    signal: firstValue(input.signal, context.signal), deadline: firstValue(input.deadline, context.deadline),
    workers: Array.isArray(args.workers) ? args.workers : firstValue(input.workers, []) };
}

function objectValue(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

module.exports = { PLUGIN_TOPOLOGIES, UNSUPPORTED_TOPOLOGIES, installTopologyPlugins, hostFrom, missionTextFrom };
