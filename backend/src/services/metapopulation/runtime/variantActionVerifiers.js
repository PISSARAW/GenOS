'use strict';

const store = require('../metapopulationStore');
const corridorStore = require('../migration/corridorStore');
const migrationStore = require('../migration/migrationStore');
const { RUNTIME_MARKERS } = require('./variantActionExecutors');
const culturalPersistentRuntime = require('../migration/culturalPersistentRuntimeService');
const { verifyCulturalActions } = require('./culturalActionVerification');
const policyService = require('./regionalPolicyService');
const islands = require('./islandExecutionService');
const topology = require('../migration/corridorGraphService');

async function verifyVariantActions(context) {
  const { plan, input, options } = context;
  const session = await store.loadSession(options.db, input.metapopulationId);
  const results = context.execution.results || [];
  return verifyPatchActions(plan.actions, session) && verifySearchAndEvolution(plan.actions, results, session)
    && verifySourceSinkRoles(plan.actions, session)
    && await verifyRuntimeEffects(context)
    && await verifyFounderReserve({ actions: plan.actions, results, db: options.db,
      metapopulationId: input.metapopulationId })
    && await verifyTrials({ actions: plan.actions, results, db: options.db, metapopulationId: input.metapopulationId })
    && await verifyMarkerReceipts({ actions: plan.actions, results, db: options.db, metapopulationId: input.metapopulationId })
    && await verifyCultureOffers({ plan, results, db: options.db, metapopulationId: input.metapopulationId })
    && await verifyCulturalActions({ actions: plan.actions, results, db: options.db,
      metapopulationId: input.metapopulationId });
}

async function verifyRuntimeEffects(context) {
  for (const action of context.plan.actions) {
    if (!await verifyRuntimeEffect(action, context)) return false;
  }
  return true;
}

async function verifyRuntimeEffect(action, context) {
  const { input, options } = context;
  if (action.type === 'HANDLE_BRIDGE_EXTINCTION') {
    const graph = await corridorStore.listGraph(options.db, input.metapopulationId);
    return graph.filter((edge) => [edge.sourceDemeId, edge.targetDemeId].includes(action.bridgeDemeId))
      .every((edge) => !edge.enabled);
  }
  if (action.type !== 'DECAY_DEME_MEMORY') return true;
  const result = context.execution.results.find((item) => item.type === action.type && item.demeId === action.demeId);
  if (!result) return false;
  if (!result.decayed) return ['NO_MEMORY', 'MINIMAL_DECAY'].includes(result.reason);
  const row = await options.db.get('SELECT decay_factor FROM daemon_memory WHERE metapopulation_id = ? AND memory_id = ?',
    input.metapopulationId, result.newMemoryId);
  return row?.decay_factor === result.decayFactor;
}

async function verifyMarkerReceipts(context) {
  const { actions, results, db, metapopulationId } = context;
  for (const type of Object.keys(RUNTIME_MARKERS)) {
    if (!await verifyMarkerFamily({ actions, results, db, metapopulationId, type })) {
      return false;
    }
  }
  return true;
}

async function verifyMarkerFamily(context) {
  const { actions, results, db, metapopulationId, type } = context;
  const expected = actions.filter((item) => item.type === type);
  if (!expected.length) return true;
  const actual = results.filter((item) => item.type === type);
  if (actual.length !== expected.length) return false;
  const verifier = policyService.EVENT_ACTIONS[type] ? policyService.verifyPolicyAction : MARKER_VERIFIERS[type];
  if (!verifier) return false;
  return verifyMarkerItems({ actual, expected, db, metapopulationId }, verifier);
}

async function verifyMarkerItems(context, verifier) {
  const remaining = [...context.expected];
  for (const item of context.actual) {
    const index = remaining.findIndex((action) => actionScope(action) === actionScope(item));
    if (index < 0) return false;
    const [expected] = remaining.splice(index, 1);
    if (!await verifier({ ...context, item, expected })) return false;
  }
  return remaining.length === 0;
}

function actionScope(action) {
  return [action.requestedCultureId, action.patchId, action.patch?.patchId, action.demeId, action.corridorId,
    action.request?.demeId, action.propaguleId, action.propagule?.propaguleId, action.cultureId, action.culture?.id].find(Boolean) || '';
}

const MARKER_VERIFIERS = Object.freeze({
  ACTIVATE_RESERVE_CORRIDOR: async ({ item, db, metapopulationId }) => {
    if (typeof item.activated !== 'boolean') return false;
    if (!item.activated) return typeof item.reason === 'string';
    const graph = await corridorStore.listGraph(db, metapopulationId);
    return graph.some(c => c.corridorId === item.corridorId && c.enabled && !c.isReserve);
  },
  DEPLOY_FOUNDER: async ({ item, db, metapopulationId }) => {
    if (typeof item.deployed !== 'boolean') return false;
    if (!item.deployed) return typeof item.reason === 'string';
    const rows = await db.all('SELECT colonization_id FROM metapopulation_colonizations WHERE metapopulation_id = ? AND colonization_id = ?', metapopulationId, item.colonizationId);
    return rows.length > 0 && rows[0].colonization_id === item.colonizationId;
  },
  ROTATE_SOURCE_SINK_ROLES: async ({ item, db, metapopulationId }) => {
    if (!item.persisted || !Number.isInteger(item.rotated) || !Array.isArray(item.changes)) return false;
    const session = await store.loadSession(db, metapopulationId);
    const roles = session.regionalMemory?.sourceSinkRoles || {};
    return item.changes.every(change => roles[change.demeId]?.role === change.to);
  },
  MIGRATE_ISLAND_ELITE: async ({ item, db, metapopulationId }) => {
    if (!item.migrationId) return false;
    const migration = await migrationStore.getMigration(db, metapopulationId, item.migrationId);
    return migration && ['ACCEPTED', 'REJECTED', 'ROLLED_BACK'].includes(migration.status);
  },
  STAGE_FOUNDER_RESERVE: async ({ item, db, metapopulationId }) => {
    if (!item.staged || !Number.isFinite(item.eventRevision)) return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'FOUNDER_RESERVE_STAGED' && e.revision === item.eventRevision);
  },
  MAINTAIN_RESIDENT_DAEMON: async ({ item, db, metapopulationId }) => {
    if (typeof item.maintained !== 'boolean' || !item.demeId) return false;
    const lease = await require('./persistentDaemonLeaseService').loadDaemonLease(db, metapopulationId, item.demeId);
    return item.maintained ? Boolean(lease?.active && lease.expiresAt > Date.now()) : typeof item.reason === 'string';
  },
  UPDATE_DEME_MEMORY: async ({ item, db, metapopulationId }) => {
    if (!item.updated || !item.memoryRef) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.localMemoryRef === item.memoryRef;
  },
  INTER_MISSION_MIGRATION: async ({ item, db, metapopulationId }) => {
    const migration = await migrationStore.getMigration(db, metapopulationId, item.migrationId);
    return migration && ['ACCEPTED', 'REJECTED', 'ROLLED_BACK'].includes(migration.status)
      && migration.status === item.status;
  },
  TRANSFER_CULTURE: async ({ item, db, metapopulationId, expected }) => {
    if (typeof item.offered !== 'boolean') return false;
    if (!item.offered) return typeof item.reason === 'string' && item.cultureId === expected.culture.id;
    const culture = await culturalPersistentRuntime.getCulture({ db, metapopulationId, cultureId: item.cultureId });
    if (!culture || culture.version !== expected.culture.version) return false;
    const migration = await migrationStore.getMigration(db, metapopulationId, item.migrationId);
    return migration && ['QUARANTINED', 'ACCEPTED', 'REJECTED'].includes(migration.status);
  },
  REJECT_CULTURE_TRANSFER: async ({ item, expected }) => {
    return item.rejected === true && item.cultureId === expected.cultureId && item.reason === expected.reason;
  },
  MUTATE_CULTURE: async ({ item, db, metapopulationId, expected }) => {
    if (typeof item.mutated !== 'boolean') return false;
    if (!item.mutated) return item.reason === 'CULTURE_NOT_FOUND';
    const child = await culturalPersistentRuntime.getCulture({ db, metapopulationId, cultureId: item.cultureId });
    return child?.parentCultureId === expected.cultureId && child.version === item.newVersion
      && child.contentHash === item.contentHash;
  },
  BUILD_CULTURAL_PHYLOGENY: async ({ item, db, metapopulationId }) => {
    if (!Array.isArray(item.nodes) || !Number.isSafeInteger(item.count)) return false;
    const persisted = await culturalPersistentRuntime.buildCulturalPhylogeny({ db, metapopulationId });
    return item.count === persisted.count && JSON.stringify(item.nodes) === JSON.stringify(persisted.nodes);
  },
  CREATE_EPHEMERAL_PATCH_LEASE: verifyPatchLeaseReceipt,
  RENEW_EPHEMERAL_PATCH_LEASE: verifyPatchLeaseReceipt,
  REGISTER_RESIDENT_DAEMON: verifyDaemonLeaseReceipt,
  MAINTAIN_RESIDENT_DAEMON_CYCLE: async ({ item, db, metapopulationId }) => {
    if (typeof item.maintained !== 'boolean' || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    const lease = await require('./persistentDaemonLeaseService').loadDaemonLease(db, metapopulationId, item.demeId);
    return item.maintained ? Boolean(deme?.status === 'ACTIVE' && lease?.active) : typeof item.reason === 'string';
  },
  EXPIRE_RESIDENT_DAEMON: async ({ item, db, metapopulationId }) => {
    if (!item.deactivated || !item.demeId) return false;
    const lease = await require('./persistentDaemonLeaseService').loadDaemonLease(db, metapopulationId, item.demeId);
    return !lease?.active;
  },
});

async function verifyFounderReserve(context) {
  const { actions, results, db, metapopulationId } = context;
  const staged = actions.filter((action) => action.type === 'STAGE_FOUNDER_RESERVE');
  if (!staged.length) return true;
  const events = await store.listEvents(db, metapopulationId);
  return staged.every((action) => results.some((result) => result.type === action.type
    && result.staged === true && result.eventRevision
    && events.some((event) => event.type === 'FOUNDER_RESERVE_STAGED'
      && event.revision === result.eventRevision
      && JSON.stringify(event.payload.founders) === JSON.stringify(action.founders))));
}

function verifySourceSinkRoles(actions, session) {
  const rotations = actions.filter((action) => action.type === 'ROTATE_SOURCE_SINK_ROLES');
  const roles = session.regionalMemory?.sourceSinkRoles || {};
  return rotations.every((action) => action.changes.every((change) => roles[change.demeId]?.role === change.to));
}

async function verifyCultureOffers(context) {
  const { plan, results, db, metapopulationId } = context;
  const offered = results.filter((item) => item.type === 'TRANSFER_CULTURE' && item.offered === true);
  if (!offered.length) return true;
  const migrationStore = require('../migration/migrationStore');
  const rows = await Promise.all(offered.map((item) => migrationStore.getMigration(db, metapopulationId, item.migrationId)));
  return rows.every((row) => row && ['QUARANTINED', 'ACCEPTED', 'REJECTED'].includes(row.status));
}

function verifyPatchActions(actions, session) {
  return actions.every((action) => {
    const patch = session.patches.find((item) => item.patchId === (action.patchId || action.patch?.patchId));
    const deme = session.demes.find((item) => item.demeId === action.demeId);
    return PATCH_VERIFIERS[action.type]?.({ patch, deme }) ?? true;
  });
}

function isEphemeral(patch) { return patch?.environment?.runtime?.ephemeral === true; }

const PATCH_VERIFIERS = Object.freeze({
  DISCOVER_EPHEMERAL_PATCH: ({ patch }) => Boolean(patch && isEphemeral(patch)),
  EXPIRE_EPHEMERAL_PATCH: ({ patch }) => patch?.status === 'UNAVAILABLE',
  REBIND_EPHEMERAL_PATCH: ({ patch }) => patch?.status === 'AVAILABLE',
  ACTIVATE_EPHEMERAL_DEME: ({ deme }) => deme?.status === 'ACTIVE',
  VACATE_COLLAPSED_PATCH: ({ patch }) => patch?.status === 'VACANT',
  DORMANT_EPHEMERAL_DEME: ({ deme }) => deme?.status === 'DORMANT'
});

function verifySearchAndEvolution(actions, results, session) {
  const expected = actions.filter((action) => ['SEARCH_ISLAND', 'EVOLVE_ISLAND'].includes(action.type));
  const remaining = results.filter((item) => ['SEARCH_ISLAND', 'EVOLVE_ISLAND'].includes(item.type));
  if (expected.length !== remaining.length) return false;
  return expected.every((action) => {
    const index = remaining.findIndex((item) => item.type === action.type && item.demeId === action.request.demeId);
    return index >= 0 && islands.verifyIslandResult(action, remaining.splice(index, 1)[0], session);
  });
}

async function verifyTrials(context) {
  const { actions, results, db, metapopulationId } = context;
  const trials = results.filter((item) => item.type === 'START_RECOLONIZATION_TRIAL');
  if (!actions.some((item) => item.type === 'START_RECOLONIZATION_TRIAL')) return true;
  const rows = await db.all('SELECT colonization_id, status FROM metapopulation_colonizations WHERE metapopulation_id = ?', metapopulationId);
  return trials.length === actions.filter((item) => item.type === 'START_RECOLONIZATION_TRIAL').length
    && trials.every((trial) => rows.some((row) => row.colonization_id === trial.colonizationId && row.status === 'IN_TRIAL'));
}

async function verifyTopologyActions(context) {
  const actions = context.plan.actions.filter((item) => ['APPLY_VARIANT_TOPOLOGY', 'REWIRE_VARIANT_TOPOLOGY'].includes(item.type));
  if (!actions.length) return true;
  const graph = await corridorStore.listGraph(context.options.db, context.input.metapopulationId);
  for (const action of actions) {
    const expected = action.corridors || await topology.planTopology(context.input.metapopulationId, context.options);
    if (!expected.every((edge) => graph.some((stored) => sameCorridor(edge, stored)))) return false;
    if (graph.some((edge) => edge.enabled && !expected.some((item) =>
      item.sourceDemeId === edge.sourceDemeId && item.targetDemeId === edge.targetDemeId && item.enabled))) return false;
  }
  return true;
}

function sameCorridor(expected, actual) {
  return ['sourceDemeId', 'targetDemeId', 'enabled', 'capacity', 'migrationCost', 'compatibility', 'weight']
    .every((field) => expected[field] === actual[field]);
}

async function verifyPatchLeaseReceipt({ item, expected, db, metapopulationId }) {
  if (!item.leaseId || item.patchId !== expected.patchId) return false;
  const lease = await db.get('SELECT expires_at FROM ephemeral_leases WHERE metapopulation_id = ? AND lease_id = ? AND patch_id = ?',
    metapopulationId, item.leaseId, expected.patchId);
  return Boolean(lease && Date.parse(lease.expires_at) > Date.now());
}

async function verifyDaemonLeaseReceipt({ item, expected, db, metapopulationId }) {
  if (!item.daemonId || !item.leaseId) return false;
  const lease = await db.get('SELECT expires_at, active FROM daemon_leases WHERE metapopulation_id = ? AND lease_id = ? AND deme_id = ? AND daemon_id = ?',
    metapopulationId, item.leaseId, expected.demeId, item.daemonId);
  const deme = await store.getDeme(db, metapopulationId, expected.demeId);
  return Boolean(lease?.active && lease.expires_at && Date.parse(lease.expires_at) > Date.now()
    && deme?.workspacePath === item.workspacePath);
}

async function verifyFirebreakActions(context) {
  const actions = context.plan.actions.filter((item) => item.type === 'RECOVER_FIREBREAKS');
  const regulated = context.plan.actions.filter((item) => item.type === 'REGULATE_CORRIDORS');
  if (!actions.length && !regulated.length) return true;
  const graph = await corridorStore.listGraph(context.options.db, context.input.metapopulationId);
  return actions.every((action) => action.pairs.every((pair) => graph.some((edge) => edge.sourceDemeId === pair.sourceDemeId
    && edge.targetDemeId === pair.targetDemeId && edge.enabled && edge.homogenizationRisk <= pair.risk)))
    && regulated.every((action) => action.pairs.every((pair) => graph.some((edge) => edge.sourceDemeId === pair.sourceDemeId
      && edge.targetDemeId === pair.targetDemeId && edge.homogenizationRisk >= pair.risk)));
}

module.exports = { verifyVariantActions, verifyTopologyActions, verifyFirebreakActions };
