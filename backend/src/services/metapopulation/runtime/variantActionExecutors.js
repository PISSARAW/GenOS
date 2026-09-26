'use strict';

const store = require('../metapopulationStore');
const recolonization = require('../patches/recolonizationService');
const patchService = require('../patches/patchService');
const patchLifecycle = require('../patches/patchLifecycleService');
const demeLifecycle = require('../demes/demeLifecycleService');
const evolution = require('../evolution/metapopulationEvolutionBridge');
const search = require('../evolution/islandSearchBridge');
const corridors = require('../migration/corridorGraphService');
const corridorStore = require('../migration/corridorStore');
const classicPatchRuntime = require('./classicPatchRuntimeService');
const ephemeralLeaseService = require('./ephemeralLeaseService');
const persistentDaemonLeaseService = require('./persistentDaemonLeaseService');
const persistentRuntimeService = require('./persistentRuntimeService');
const migrationStore = require('../migration/migrationStore');

async function executeVariantAction(action, context) {
  return EXECUTORS[action.type]?.(action, context) ?? executeRuntimeMarkerAction(action, context);
}

async function executeRuntimeMarkerAction(action, context) {
  return RUNTIME_MARKERS[action.type]?.(action, context) ?? null;
}

const RUNTIME_MARKERS = Object.freeze({
  TRIGGER_ISLAND_MIGRATION: async (action) => ({ type: action.type, triggered: true, interval: action.interval, reason: action.reason }),
  TRIGGER_STEPPING_STONE_MIGRATION: async (action) => ({ type: action.type, triggered: true, interval: action.interval }),
  ACTIVATE_RESERVE_CORRIDOR: activateReserveCorridor,
  DEPLOY_FOUNDER: deployFounder,
  PROTECT_SOURCE: async (action) => ({ type: action.type, demeId: action.demeId, reason: action.reason, protected: true }),
  RECOVERY_SLA_BREACH: async (action) => ({ type: action.type, demeId: action.demeId, slaMs: action.slaMs, breached: true }),
  ROTATE_SOURCE_SINK_ROLES: async (action) => ({ type: action.type, rotated: action.changes.length, changes: action.changes }),
  MIGRATE_ISLAND_ELITE: async (action) => ({ type: action.type, propaguleId: action.propagule.propaguleId, migrated: true }),
  PROOF_OF_DATA_MINIMIZATION: async (action) => ({ type: action.type, propaguleId: action.propaguleId, proofId: action.proofId, proven: true }),
  REQUIRE_RECEIVER_ATTESTATION: async (action) => ({ type: action.type, propaguleId: action.propaguleId, targetRegion: action.targetRegion, required: true }),
  STAGE_FOUNDER_RESERVE: async (action) => ({ type: action.type, deficit: action.deficit, staged: true }),
  DIVERSITY_FLOOR_BREACH: async (action) => ({ type: action.type, currentDiversity: action.currentDiversity, floor: action.floor, breached: true }),
  ALLOW_CONTROLLED_EXTINCTION: async (action) => ({ type: action.type, demeId: action.demeId, allowed: true }),
  PROTECT_FROM_EXTINCTION: async (action) => ({ type: action.type, demeId: action.demeId, uniqueCapabilities: action.uniqueCapabilities, protected: true }),
  REJECT_FEDERATED_TRANSFER: async (action) => ({ type: action.type, propaguleId: action.propaguleId, reason: action.reason, rejected: true }),
  REDACT_PROPAGULE: async (action) => ({ type: action.type, propaguleId: action.propaguleId, fields: action.fields, redacted: true }),
  REQUIRE_SOVEREIGNTY_ACKNOWLEDGMENT: async (action) => ({ type: action.type, demeId: action.demeId, required: true }),
  MAINTAIN_RESIDENT_DAEMON: maintainResidentDaemonDb,
  UPDATE_DEME_MEMORY: updateDemeMemory,
  INTER_MISSION_MIGRATION: async (action, context) => ({ type: action.type, scheduled: true, migration: interMissionSummary(action) }),
  LOCAL_REPRODUCTION: async (action) => ({ type: action.type, demeId: action.demeId, recorded: true, populationSize: Array.isArray(action.population) ? action.population.length : 0 }),
  CHECK_SPECIATION: async (action) => ({ type: action.type, checked: true, demeCount: Array.isArray(action.demes) ? action.demes.length : 0 }),
  TRANSFER_CULTURE: transferCultureOffer,
  REJECT_CULTURE_TRANSFER: async (action) => ({ type: action.type, cultureId: action.cultureId, reason: action.reason, rejected: true }),
  MUTATE_CULTURE: mutateCulture,
  BUILD_CULTURAL_PHYLOGENY: buildPhylogeny,
  COLLAPSE_DETECTED_POPULATE_VACANCY: async (action, context) => {
    const session = await store.loadSession(context.options.db, context.input.metapopulationId);
    const result = await classicPatchRuntime.runClassicPatchCycle(session, context.input, context.options);
    return { type: action.type, ...result };
  },
  STAGE_FOUNDER_RESERVE: async (action) => ({ type: action.type, staged: true, deficit: action.deficit, atRiskCount: action.atRiskCount }),
  PROOF_OF_DATA_MINIMIZATION: async (action) => ({ type: action.type, recorded: true, propaguleId: action.propaguleId, proofId: action.proofId, contractId: action.contractId }),
  REQUIRE_RECEIVER_ATTESTATION: async (action) => ({ type: action.type, required: true, propaguleId: action.propaguleId, targetRegion: action.targetRegion }),
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
    await persistentLeaseService.deactivateDaemonLease(context.options.db, context.input.metapopulationId, action.demeId);
    return { type: action.type, demeId: action.demeId, deactivated: true };
  },
});

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

async function maintainResidentDaemon(action, context) {
  const deme = await store.getDeme(context.options.db, context.input.metapopulationId, action.demeId);
  const maintained = deme?.status === 'ACTIVE';
  return { type: action.type, demeId: action.demeId, maintained, status: deme?.status || null };
}

async function maintainResidentDaemonDb(action, context) {
  const { input, options } = context;
  const db = options.db;
  const demeId = action.demeId;
  const deme = await store.getDeme(db, input.metapopulationId, demeId);
  if (!deme || deme.status !== 'ACTIVE') {
    return { type: action.type, demeId, maintained: false, reason: 'DEME_NOT_ACTIVE' };
  }
  const activeLease = await persistentLeaseService.loadDaemonLease(db, input.metapopulationId, demeId);
  if (!activeLease || activeLease.expiresAt < Date.now()) {
    return { type: action.type, demeId, maintained: false, reason: 'LEASE_EXPIRED' };
  }
  const extended = await persistentLeaseService.extendDaemonLease({ db, metapopulationId: input.metapopulationId, demeId, ttlMs: 600000 });
  return { type: action.type, demeId, maintained: true, expiresAt: extended.expiresAt, leaseId: extended.leaseId };
}

async function updateDemeMemory(action, context) {
  await store.updateDemeProfile(context.options.db, { metapopulationId: context.input.metapopulationId,
    demeId: action.demeId, changes: { localMemoryRef: action.memoryRef } });
  return { type: action.type, demeId: action.demeId, memoryRef: action.memoryRef, updated: true };
}

function interMissionSummary(action) {
  const { type, ...migration } = action;
  return migration;
}

async function transferCultureOffer(action, context) {
  const { input, options } = context;
  const culture = action.culture || {};
  const targetDemeId = action.targetDemeId;
  const sourceDemeId = action.sourceDemeId || input.cultureSourceById?.[culture.id] || null;
  if (!sourceDemeId) return { type: action.type, cultureId: culture.id, offered: false, reason: 'SOURCE_DEME_UNKNOWN' };
  const corridor = (context.observed?.corridors || []).find((c) => c.enabled && c.capacity > 0
    && c.sourceDemeId === sourceDemeId && c.targetDemeId === targetDemeId);
  if (!corridor) return { type: action.type, cultureId: culture.id, offered: false, reason: 'NO_ADMISSIBLE_CORRIDOR' };
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
  return ['PROCEDURE', 'MEMORY_FRAGMENT', 'ARTIFACT', 'COGNITIVE_RECIPE', 'STRATEGY'].includes(culture.payloadType)
    ? culture.payloadType : 'PROCEDURE';
}

async function mutateCulture(action) {
  const runtime = require('../migration/culturalRuntimeService');
  const result = runtime.mutateCultureLocally(action.cultureId, action.mutation, action.mutatorId || 'regional-runtime');
  return { type: action.type, cultureId: action.cultureId, ...result };
}

async function buildPhylogeny(action) {
  const runtime = require('../migration/culturalRuntimeService');
  const ids = Array.isArray(action.cultureIds) ? action.cultureIds
    : (Array.isArray(action.demes) ? action.demes.flatMap((d) => d.cultureIds || []) : []);
  return { type: action.type, ...runtime.buildCulturalPhylogeny(ids) };
}

const EXECUTORS = Object.freeze({
  APPLY_VARIANT_TOPOLOGY: (_action, context) => topologyResult('APPLY_VARIANT_TOPOLOGY', context.input, context.options),
  REWIRE_VARIANT_TOPOLOGY: (action, context) => topologyResult('REWIRE_VARIANT_TOPOLOGY', context.input,
    { ...context.options, candidateEdges: action.corridors }),
  START_RECOLONIZATION_TRIAL: startTrial,
  EVOLVE_ISLAND: async (action, context) => ({ type: action.type,
    ...(await evolution.evolveIsland(action.request, context.options)) }),
  SEARCH_ISLAND: async (action, context) => ({ type: action.type,
    ...(await search.searchIsland(action.request, context.options)) }),
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
    await persistentLeaseService.deactivateDaemonLease(context.options.db, context.input.metapopulationId, action.demeId);
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
