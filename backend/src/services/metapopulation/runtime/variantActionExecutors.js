'use strict';

const store = require('../metapopulationStore');
const recolonization = require('../patches/recolonizationService');
const patchService = require('../patches/patchService');
const patchLifecycle = require('../patches/patchLifecycleService');
const demeLifecycle = require('../demes/demeLifecycleService');
const islands = require('./islandExecutionService');
const corridors = require('../migration/corridorGraphService');
const corridorStore = require('../migration/corridorStore');
const ephemeralLeaseService = require('./ephemeralLeaseService');
const persistentDaemonLeaseService = require('./persistentDaemonLeaseService');
const persistentRuntimeService = require('./persistentRuntimeService');
const migrationStore = require('../migration/migrationStore');
const migrationLoop = require('./regionalMigrationLoopService');
const culturalPersistentRuntime = require('../migration/culturalPersistentRuntimeService');
const policyService = require('./regionalPolicyService');

async function executeVariantAction(action, context) {
  if (policyService.EVENT_ACTIONS[action.type]) return policyService.executePolicyAction(action, context);
  return EXECUTORS[action.type]?.(action, context) ?? executeRuntimeMarkerAction(action, context);
}

async function executeRuntimeMarkerAction(action, context) {
  if (policyService.EVENT_ACTIONS[action.type]) return policyService.executePolicyAction(action, context);
  return RUNTIME_MARKERS[action.type]?.(action, context) ?? null;
}

const RUNTIME_MARKERS = Object.freeze({
  ...Object.fromEntries(Object.keys(policyService.EVENT_ACTIONS).map((type) => [type, policyService.executePolicyAction])),
  ACTIVATE_RESERVE_CORRIDOR: activateReserveCorridor,
  DEPLOY_FOUNDER: deployFounder,
  ROTATE_SOURCE_SINK_ROLES: persistSourceSinkRoles,
  MIGRATE_ISLAND_ELITE: executeMigrant,
  MAINTAIN_RESIDENT_DAEMON: maintainResidentDaemonDb,
  UPDATE_DEME_MEMORY: updateDemeMemory,
  INTER_MISSION_MIGRATION: executeMigrant,
  TRANSFER_CULTURE: transferCultureOffer,
  REJECT_CULTURE_TRANSFER: async (action) => ({ type: action.type, cultureId: action.cultureId, reason: action.reason, rejected: true }),
  MUTATE_CULTURE: mutateCulture,
  BUILD_CULTURAL_PHYLOGENY: buildPhylogeny,
  STAGE_FOUNDER_RESERVE: stageFounderReserve,
  ...Object.fromEntries(['CREATE_EPHEMERAL_PATCH_LEASE', 'RENEW_EPHEMERAL_PATCH_LEASE',
    'REGISTER_RESIDENT_DAEMON', 'MAINTAIN_RESIDENT_DAEMON_CYCLE', 'EXPIRE_RESIDENT_DAEMON']
    .map((type) => [type, (action, context) => EXECUTORS[type](action, context)]))
});

async function executeMigrant(action, context) {
  if (!context.options.db || !context.input.metapopulationId) {
    throw Object.assign(new Error('Persistent migration context is required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  }
  const observed = context.observed;
  const candidate = migrationLoop.candidateAction(action.propagule, {
    receiver: action.receiver || context.input.receiver, trigger: {},
    sourceReserveRatio: observed.variantPolicy?.sourceReserveRatio
  }, observed);
  if (!candidate) throw Object.assign(new Error('Migration does not satisfy receiver, utility or corridor gates.'),
    { code: 'METAPOPULATION_MIGRATION_INELIGIBLE' });
  const result = await migrationLoop.executeMigrationAction(candidate, context);
  return { ...result, type: action.type, migrated: result.status === 'ACCEPTED' };
}

async function decayDemeMemory(action, context) {
  const outcome = await persistentRuntimeService.applyMemoryDecay({ db: context.options.db,
    metapopulationId: context.input.metapopulationId, demeId: action.demeId,
    decayRate: action.decayRate, options: { now: context.input.now } });
  return { type: action.type, ...outcome };
}

async function handleBridgeExtinction(action, context) {
  const graph = await corridorStore.listGraph(context.options.db, context.input.metapopulationId);
  const updated = graph.map((edge) => edge.sourceDemeId === action.bridgeDemeId
    || edge.targetDemeId === action.bridgeDemeId ? { ...edge, enabled: false } : edge);
  await corridorStore.replaceGraph(context.options.db, context.input.metapopulationId,
    { topology: 'stepping-stone', corridors: updated });
  return { type: action.type, bridgeDemeId: action.bridgeDemeId, suspended: true };
}

async function activateReserveCorridor(action, context) {
  const { input, options } = context;
  const graph = await corridorStore.listGraph(options.db, input.metapopulationId);
  const corridor = graph.find((c) => c.corridorId === action.corridorId);
  if (!corridor) return { type: action.type, corridorId: action.corridorId, activated: false, reason: 'CORRIDOR_NOT_FOUND' };
  const updated = graph.map((c) => c.corridorId === action.corridorId ? { ...c, isReserve: false, enabled: true } : c);
  await corridorStore.replaceGraph(options.db, input.metapopulationId, { topology: 'rescue', corridors: updated });
  return { type: action.type, corridorId: action.corridorId, activated: true };
}

async function deployFounder(action, context) {
  const { input, options } = context;
  const deme = (context.observed?.demes || []).find((d) => d.demeId === action.demeId);
  const patchId = deme?.patchId;
  if (!patchId) return { type: action.type, demeId: action.demeId, deployed: false, reason: 'DEME_PATCH_UNKNOWN' };
  const patch = (context.observed?.patches || []).find((p) => p.patchId === patchId);
  if (!patch || !['VACANT', 'AVAILABLE'].includes(patch.status)) {
    return { type: action.type, demeId: action.demeId, deployed: false, reason: 'PATCH_NOT_VACANT' };
  }
  const founders = Array.isArray(action.lineage) ? action.lineage : [action.lineage].filter(Boolean);
  const lineages = founders.map((f) => typeof f === 'string' ? { lineageId: f } : f).filter((f) => f?.lineageId);
  if (lineages.length < 2) return { type: action.type, demeId: action.demeId, deployed: false, reason: 'FOUNDER_SET_INSUFFICIENT' };
  const trial = await recolonization.startColonizationTrial({ metapopulationId: input.metapopulationId,
    patchId, founders: lineages, provenance: { source: 'rescue-network-runtime' },
    actor: input.actor || 'metapopulation-runtime' }, options);
  return { type: action.type, demeId: action.demeId, deployed: true, ...trial };
}

async function maintainResidentDaemonDb(action, context) {
  const { input, options } = context;
  const db = options.db;
  const demeId = action.demeId;
  const deme = await store.getDeme(db, input.metapopulationId, demeId);
  if (!deme || deme.status !== 'ACTIVE') {
    return { type: action.type, demeId, maintained: false, reason: 'DEME_NOT_ACTIVE' };
  }
  const activeLease = await persistentDaemonLeaseService.loadDaemonLease(db, input.metapopulationId, demeId);
  if (!activeLease?.active || activeLease.expiresAt < Date.now()) {
    return { type: action.type, demeId, maintained: false, reason: 'LEASE_EXPIRED' };
  }
  const extended = await persistentDaemonLeaseService.extendDaemonLease({ db, metapopulationId: input.metapopulationId, demeId, ttlMs: 600000 });
  return { type: action.type, demeId, maintained: true, expiresAt: extended.expiresAt, leaseId: extended.leaseId };
}

async function stageFounderReserve(action, context) {
  const founders = Array.isArray(action.founders) ? action.founders : [];
  if (founders.length < action.deficit || !context.options.db) {
    return { type: action.type, staged: false, deficit: action.deficit, founders: [], reason: 'FOUNDER_RESERVE_UNAVAILABLE' };
  }
  const { withTransaction } = require('../../../db');
  return withTransaction(context.options.db, async () => {
  const event = await store.appendEvent(context.options.db, context.input.metapopulationId, {
    type: 'FOUNDER_RESERVE_STAGED', actor: 'metapopulation-runtime',
    occurredAt: new Date().toISOString(), provenance: { source: 'rescue-network-variant' },
    payload: { founders, deficit: action.deficit }
  });
  const session = await store.loadSession(context.options.db, context.input.metapopulationId);
  const memory = session.regionalMemory;
  memory.founderReserve = [...(memory.founderReserve || []), ...founders];
  await context.options.db.run('UPDATE metapopulation_sessions SET regional_memory_json = ? WHERE id = ?',
    JSON.stringify(memory), context.input.metapopulationId);
  return { type: action.type, staged: true, deficit: action.deficit,
    founders, eventRevision: event.revision };
  });
}

async function persistSourceSinkRoles(action, context) {
  const db = context.options.db;
  if (!db) return { type: action.type, rotated: 0, changes: [], persisted: false, reason: 'NO_DB' };
  const result = await store.recordSourceSinkRoleChanges(db, {
    metapopulationId: context.input.metapopulationId, changes: action.changes
  });
  return { type: action.type, rotated: result.changes.length, changes: result.changes, persisted: true };
}

async function updateDemeMemory(action, context) {
  await store.updateDemeProfile(context.options.db, { metapopulationId: context.input.metapopulationId,
    demeId: action.demeId, changes: { localMemoryRef: action.memoryRef } });
  return { type: action.type, demeId: action.demeId, memoryRef: action.memoryRef, updated: true };
}

function residentDeme(demes, demeId) {
  return demes.find((deme) => deme.demeId === demeId
    && ['ACTIVE', 'STRESSED', 'ESTABLISHING'].includes(deme.status));
}

function admissibleCorridor(corridors, sourceDemeId, targetDemeId) {
  return corridors.find((corridor) => corridor.enabled && corridor.capacity > 0
    && corridor.sourceDemeId === sourceDemeId && corridor.targetDemeId === targetDemeId);
}

async function transferCultureOffer(action, context) {
  const { input, options } = context;
  const culture = action.culture || {};
  const targetDemeId = action.targetDemeId;
  const sourceDemeId = action.sourceDemeId || input.cultureSourceById?.[culture.id] || null;
  if (!sourceDemeId) return { type: action.type, cultureId: culture.id, offered: false, reason: 'SOURCE_DEME_UNKNOWN' };
  const residents = context.observed?.demes || [];
  if (!residentDeme(residents, sourceDemeId) || !residentDeme(residents, targetDemeId)) {
    return { type: action.type, cultureId: culture.id, offered: false, reason: 'DEME_NOT_RESIDENT' };
  }
  const corridor = admissibleCorridor(context.observed?.corridors || [], sourceDemeId, targetDemeId);
  if (!corridor) return { type: action.type, cultureId: culture.id, offered: false, reason: 'NO_ADMISSIBLE_CORRIDOR' };
  await culturalPersistentRuntime.registerCulture({ db: options.db, metapopulationId: input.metapopulationId,
    culture, author: sourceDemeId });
  const migrationStore = require('../migration/migrationStore');
  const offered = await migrationStore.offerMigration(options.db, { metapopulationId: input.metapopulationId,
    corridorId: corridor.corridorId,
    propagule: culturePropagule({ culture, sourceDemeId, targetDemeId, transmission: action.transmission }) });
  return { type: action.type, cultureId: culture.id, offered: true, migrationId: offered.migrationId, status: offered.status };
}

function culturePropagule(context) {
  const { culture, sourceDemeId, targetDemeId, transmission } = context;
  return { propaguleId: `culture-${culture.id}-v${culture.version}-${targetDemeId}`, type: culturePayloadType(culture),
    sourceDemeId, targetDemeId, payloadRef: culture.id, migrationReason: 'cultural',
    lineageRefs: culture.parentRefs || [], sourceEvidence: [],
    provenance: { source: 'cultural-variant', cultureId: culture.id, version: culture.version, transmission: transmission || 'horizontal' },
    sourceFitness: 0.5, novelty: 0.5 };
}

function culturePayloadType(culture) {
  const type = culture.payloadType === 'TOOL_CONFIGURATION' ? 'TOOL_CONFIG' : culture.payloadType;
  return ['PROCEDURE', 'MEMORY_FRAGMENT', 'ARTIFACT', 'COGNITIVE_RECIPE', 'STRATEGY',
    'TEST', 'VERIFIER', 'TOOL_CONFIG'].includes(type) ? type : 'PROCEDURE';
}

async function mutateCulture(action, context) {
  const result = await culturalPersistentRuntime.mutateCulture({ db: context.options.db,
    metapopulationId: context.input.metapopulationId, cultureId: action.cultureId,
    mutation: action.mutation, mutatorId: action.mutatorId || 'regional-runtime' });
  return { type: action.type, requestedCultureId: action.cultureId, ...result };
}

async function buildPhylogeny(action, context) {
  const result = await culturalPersistentRuntime.buildCulturalPhylogeny({ db: context.options.db,
    metapopulationId: context.input.metapopulationId });
  return { type: action.type, ...result };
}

const EXECUTORS = Object.freeze({
  APPLY_VARIANT_TOPOLOGY: (_action, context) => topologyResult('APPLY_VARIANT_TOPOLOGY', context.input, context.options),
  REWIRE_VARIANT_TOPOLOGY: (action, context) => topologyResult('REWIRE_VARIANT_TOPOLOGY', context.input,
    { ...context.options, candidateEdges: action.corridors }),
  START_RECOLONIZATION_TRIAL: startTrial,
  DECAY_DEME_MEMORY: decayDemeMemory,
  HANDLE_BRIDGE_EXTINCTION: handleBridgeExtinction,
  EVOLVE_ISLAND: islands.evolveIsland,
  SEARCH_ISLAND: islands.searchIsland,
  DISCOVER_EPHEMERAL_PATCH: createEphemeral,
  DORMANT_EPHEMERAL_DEME: (action, context) => demeLifecycle.transitionDeme({
    sessionId: context.input.metapopulationId, demeId: action.demeId, status: 'DORMANT' }, context.options),
  EXPIRE_EPHEMERAL_PATCH: (action, context) => patchLifecycle.transitionPatch({
    sessionId: context.input.metapopulationId, patchId: action.patchId, status: 'UNAVAILABLE' }, context.options),
  REBIND_EPHEMERAL_PATCH: (action, context) => patchLifecycle.transitionPatch({
    sessionId: context.input.metapopulationId, patchId: action.patchId, status: 'AVAILABLE' }, context.options),
  ACTIVATE_EPHEMERAL_DEME: (action, context) => demeLifecycle.transitionDeme({
    sessionId: context.input.metapopulationId, demeId: action.demeId, status: 'ACTIVE' }, context.options),
  VACATE_COLLAPSED_PATCH: (action, context) => patchLifecycle.transitionPatch({
    sessionId: context.input.metapopulationId, patchId: action.patchId, status: 'VACANT' }, context.options),
  RECOVER_FIREBREAKS: recoverFirebreaks,
  CREATE_EPHEMERAL_PATCH_LEASE: async (action, context) => {
    if (!context.options.db) return { type: action.type, leaseId: null, reason: 'NO_DB' };
    const lease = await ephemeralLeaseService.createEphemeralLease({ db: context.options.db,
      metapopulationId: context.input.metapopulationId, patchId: action.patchId, ttlMs: action.ttlMs || 300000 });
    return { type: action.type, leaseId: lease.leaseId, patchId: action.patchId, renewed: lease.renewed, expiresAt: lease.expiresAt };
  },
  RENEW_EPHEMERAL_PATCH_LEASE: async (action, context) => {
    if (!context.options.db) return { type: action.type, leaseId: null, reason: 'NO_DB' };
    const lease = await ephemeralLeaseService.extendEphemeralLease({ db: context.options.db,
      metapopulationId: context.input.metapopulationId, patchId: action.patchId, ttlMs: action.ttlMs || 300000 });
    return { type: action.type, leaseId: lease.leaseId, patchId: action.patchId, renewed: true, expiresAt: lease.expiresAt };
  },
  REGISTER_RESIDENT_DAEMON: async (action, context) => {
    if (!context.options.db) return { type: action.type, daemonId: null, reason: 'NO_DB' };
    const daemon = await persistentRuntimeService.registerResidentDaemon({ db: context.options.db,
      metapopulationId: context.input.metapopulationId, demeId: action.demeId,
      daemonId: action.daemonId || `daemon-${action.demeId}`, ownerId: action.ownerId,
      ttlMs: action.ttlMs || 600000, options: context.options });
    return { type: action.type, daemonId: daemon.daemonId, demeId: daemon.demeId, leaseId: daemon.leaseId, workspacePath: daemon.workspacePath, expiresAt: daemon.expiresAt };
  },
  MAINTAIN_RESIDENT_DAEMON_CYCLE: async (action, context) => {
    if (!context.options.db) return { type: action.type, demeId: action.demeId, maintained: false, reason: 'NO_DB' };
    const result = await persistentRuntimeService.maintainResidentDaemon({ db: context.options.db,
      metapopulationId: context.input.metapopulationId, demeId: action.demeId, options: context.options });
    return { type: action.type, demeId: action.demeId, maintained: result.maintained, ...result };
  },
  EXPIRE_RESIDENT_DAEMON: async (action, context) => {
    if (!context.options.db) return { type: action.type, demeId: action.demeId, deactivated: false, reason: 'NO_DB' };
    await persistentDaemonLeaseService.deactivateDaemonLease(context.options.db, context.input.metapopulationId, action.demeId);
    return { type: action.type, demeId: action.demeId, deactivated: true };
  },
});

async function topologyResult(type, input, options) {
  const graph = await corridors.applyTopology(input.metapopulationId, options);
  return { type, corridorCount: graph.length };
}

async function startTrial(action, context) {
  const trial = await recolonization.startColonizationTrial({ metapopulationId: context.input.metapopulationId,
    patchId: action.patchId, founders: action.founders,
    provenance: { source: 'regionalBrainService', variant: 'classic_patch' },
    actor: context.input.actor || 'metapopulation-runtime' }, context.options);
  return { type: action.type, ...trial };
}

async function createEphemeral(action, context) {
  const patch = await patchService.createPatch(action.patch, { ...context.options,
    metapopulationId: context.input.metapopulationId });
  return { type: action.type, patchId: patch.patchId, status: patch.status };
}

async function recoverFirebreaks(action, context) {
  const { input, options } = context;
  const pairs = new Map(action.pairs.map((pair) => [`${pair.sourceDemeId}->${pair.targetDemeId}`, pair]));
  const graph = await corridorStore.listGraph(options.db, input.metapopulationId);
  const updated = graph.map((edge) => {
    const pair = pairs.get(`${edge.sourceDemeId}->${edge.targetDemeId}`);
    return pair ? { ...edge, enabled: true, homogenizationRisk: pair.risk } : edge;
  });
  const stored = await corridorStore.replaceGraph(options.db, input.metapopulationId,
    { topology: 'anti-synchrony', corridors: updated });
  return { type: action.type, recovered: stored.filter((edge) => pairs.has(`${edge.sourceDemeId}->${edge.targetDemeId}`) && edge.enabled).length };
}

module.exports = { executeVariantAction, executeRuntimeMarkerAction, RUNTIME_MARKERS, EXECUTORS };
