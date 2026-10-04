'use strict';

const store = require('../metapopulationStore');
const corridorStore = require('../migration/corridorStore');
const migrationStore = require('../migration/migrationStore');
const { RUNTIME_MARKERS } = require('./variantActionExecutors');
const culturalPersistentRuntime = require('../migration/culturalPersistentRuntimeService');
const { verifyCulturalActions } = require('./culturalActionVerification');

async function verifyVariantActions(context) {
  const { plan, input, options } = context;
  const session = await store.loadSession(options.db, input.metapopulationId);
  const results = context.execution.results || [];
  return verifyPatchActions(plan.actions, session) && verifySearchAndEvolution(plan.actions, results)
    && verifySourceSinkRoles(plan.actions, session)
    && await verifyFounderReserve({ actions: plan.actions, results, db: options.db,
      metapopulationId: input.metapopulationId })
    && verifyTrials({ actions: plan.actions, results, db: options.db, metapopulationId: input.metapopulationId })
    && await verifyMarkerReceipts({ actions: plan.actions, results, db: options.db, metapopulationId: input.metapopulationId })
    && await verifyCultureOffers({ plan, results, db: options.db, metapopulationId: input.metapopulationId })
    && await verifyCulturalActions({ actions: plan.actions, results, db: options.db,
      metapopulationId: input.metapopulationId });
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
  const verifier = MARKER_VERIFIERS[type];
  if (!verifier) return true;
  for (const item of actual) {
    const matched = expected.find((action) => actionScope(action) === actionScope(item));
    if (!matched || !await verifier({ item, db, metapopulationId, expected: matched })) {
      return false;
    }
  }
  return true;
}

function actionScope(action) {
  return action.requestedCultureId || action.patchId || action.patch?.patchId || action.demeId || action.corridorId
    || action.propaguleId || action.propagule?.propaguleId || action.cultureId || action.culture?.id || '';
}

const MARKER_VERIFIERS = Object.freeze({
  TRIGGER_ISLAND_MIGRATION: async ({ item, db, metapopulationId }) => {
    if (!item.triggered || !Number.isFinite(item.interval)) return false;
    const migrations = await migrationStore.listMigrations(db, metapopulationId);
    return migrations.some(m => m.triggerReason === 'island_migration' && m.interval === item.interval);
  },
  TRIGGER_STEPPING_STONE_MIGRATION: async ({ item, db, metapopulationId }) => {
    if (!item.triggered || !Number.isFinite(item.interval)) return false;
    const migrations = await migrationStore.listMigrations(db, metapopulationId);
    return migrations.some(m => m.triggerReason === 'stepping_stone' && m.interval === item.interval);
  },
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
  PROTECT_SOURCE: async ({ item, db, metapopulationId }) => {
    if (!item.protected || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.status === 'ACTIVE' && deme?.protectedFromCull === true;
  },
  RECOVERY_SLA_BREACH: async ({ item, db, metapopulationId }) => {
    if (!item.breached || !item.demeId) return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'RECOVERY_SLA_BREACH' && e.payload?.demeId === item.demeId);
  },
  ROTATE_SOURCE_SINK_ROLES: async ({ item, db, metapopulationId }) => {
    if (!item.persisted || !Number.isInteger(item.rotated) || !Array.isArray(item.changes)) return false;
    const session = await store.loadSession(db, metapopulationId);
    const roles = session.regionalMemory?.sourceSinkRoles || {};
    return item.changes.every(change => roles[change.demeId]?.role === change.to);
  },
  MIGRATE_ISLAND_ELITE: async ({ item, db, metapopulationId }) => {
    if (!item.migrated || !item.propaguleId) return false;
    const migration = await migrationStore.getMigration(db, metapopulationId, item.propaguleId);
    return migration && ['ACCEPTED', 'REJECTED', 'ROLLED_BACK'].includes(migration.status);
  },
  REQUIRE_RECEIVER_ATTESTATION: async ({ item, db, metapopulationId }) => {
    if (!item.required || !item.propaguleId) return false;
    const migration = await migrationStore.getMigration(db, metapopulationId, item.propaguleId);
    return migration && migration.receiverAttestation?.verified === true;
  },
  STAGE_FOUNDER_RESERVE: async ({ item, db, metapopulationId }) => {
    if (!item.staged || !Number.isFinite(item.eventRevision)) return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'FOUNDER_RESERVE_STAGED' && e.revision === item.eventRevision);
  },
  DIVERSITY_FLOOR_BREACH: async ({ item, db, metapopulationId }) => {
    if (!item.breached || !Number.isFinite(item.currentDiversity)) return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'DIVERSITY_FLOOR_BREACH' && e.payload?.currentDiversity === item.currentDiversity);
  },
  ALLOW_CONTROLLED_EXTINCTION: async ({ item, db, metapopulationId }) => {
    if (!item.allowed || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.status === 'COLLAPSED' && deme?.allowedExtinction === true;
  },
  PROTECT_FROM_EXTINCTION: async ({ item, db, metapopulationId }) => {
    if (!item.protected || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.protectedFromCull === true;
  },
  REJECT_FEDERATED_TRANSFER: async ({ item, db, metapopulationId }) => {
    if (!item.rejected || !item.reason) return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'FEDERATED_TRANSFER_REJECTED' && e.payload?.reason === item.reason);
  },
  REDACT_PROPAGULE: async ({ item, db, metapopulationId }) => {
    if (!item.redacted) return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'PROPAGULE_REDACTED' && e.payload?.propaguleId === item.propaguleId);
  },
  REQUIRE_SOVEREIGNTY_ACKNOWLEDGMENT: async ({ item, db, metapopulationId }) => {
    if (!item.required || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.sovereigntyAcknowledged === true;
  },
  MAINTAIN_RESIDENT_DAEMON: async ({ item, db, metapopulationId }) => {
    if (typeof item.maintained !== 'boolean' || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.status === 'ACTIVE' && item.maintained === (deme?.daemonLeaseActive === true);
  },
  UPDATE_DEME_MEMORY: async ({ item, db, metapopulationId }) => {
    if (!item.updated || !item.memoryRef) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.localMemoryRef === item.memoryRef;
  },
  INTER_MISSION_MIGRATION: async ({ item, db, metapopulationId }) => {
    if (!item.scheduled || !item.migration) return false;
    const migrations = await migrationStore.listMigrations(db, metapopulationId);
    return migrations.some(m => m.migrationId === item.migration.migrationId);
  },
  CHECK_SPECIATION: async ({ item, db, metapopulationId }) => {
    if (!item.demeA || !item.demeB || !Number.isFinite(item.divergence) || !Number.isFinite(item.threshold) || typeof item.speciated !== 'boolean') return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'SPECIATION_DETECTED' && e.payload?.demeA === item.demeA && e.payload?.demeB === item.demeB);
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
  COLLAPSE_DETECTED_POPULATE_VACANCY: async ({ item, db, metapopulationId }) => {
    if (!Array.isArray(item.results)) return false;
    const rows = await db.all('SELECT colonization_id FROM metapopulation_colonizations WHERE metapopulation_id = ? AND status = ?', metapopulationId, 'IN_TRIAL');
    return rows.length >= item.results.length;
  },
  CREATE_EPHEMERAL_PATCH_LEASE: async ({ item, db, metapopulationId }) => {
    if (!item.leaseId || !item.patchId) return false;
    const lease = await db.get('SELECT lease_id FROM metapopulation_ephemeral_leases WHERE metapopulation_id = ? AND lease_id = ?', metapopulationId, item.leaseId);
    return !!lease;
  },
  RENEW_EPHEMERAL_PATCH_LEASE: async ({ item, db, metapopulationId }) => {
    if (!item.leaseId || !item.patchId || item.renewed !== true) return false;
    const lease = await db.get('SELECT lease_id, expires_at FROM metapopulation_ephemeral_leases WHERE metapopulation_id = ? AND lease_id = ?', metapopulationId, item.leaseId);
    return lease && lease.expires_at > Date.now();
  },
  REGISTER_RESIDENT_DAEMON: async ({ item, db, metapopulationId }) => {
    if (!item.daemonId || !item.leaseId) return false;
    const lease = await db.get('SELECT lease_id FROM metapopulation_daemon_leases WHERE metapopulation_id = ? AND lease_id = ?', metapopulationId, item.leaseId);
    return !!lease;
  },
  MAINTAIN_RESIDENT_DAEMON_CYCLE: async ({ item, db, metapopulationId }) => {
    if (typeof item.maintained !== 'boolean' || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.status === 'ACTIVE' && item.maintained === (deme?.daemonLeaseActive === true);
  },
  EXPIRE_RESIDENT_DAEMON: async ({ item, db, metapopulationId }) => {
    if (!item.deactivated || !item.demeId) return false;
    const deme = await store.getDeme(db, metapopulationId, item.demeId);
    return deme?.daemonLeaseActive !== true;
  },
  PROOF_OF_DATA_MINIMIZATION: async ({ item, db, metapopulationId }) => {
    if (!item.recorded || !item.proven) return false;
    if (!item.proof || item.proof.proofId !== item.proofId || item.proof.contractId !== item.contractId) return false;
    if (!Number.isSafeInteger(item.proof.originalFieldCount) || !Number.isSafeInteger(item.proof.transferredFieldCount)) return false;
    if (item.proof.transferredFieldCount > item.proof.originalFieldCount) return false;
    const events = await store.listEvents(db, metapopulationId);
    return events.some(e => e.type === 'DATA_MINIMIZATION_PROOF' && e.payload?.proofId === item.proofId);
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

function verifySearchAndEvolution(actions, results) {
  return verifyResultFamily({ actions, results, type: 'SEARCH_ISLAND', predicate: (item) => item.engine === 'island-search-adapter' && typeof item.incumbentRef === 'string' })
    && verifyResultFamily({ actions, results, type: 'EVOLVE_ISLAND', predicate: (item) => item.engine === 'rust-multi-island' && Number.isSafeInteger(item.generation) });
}

function verifyResultFamily(context) {
  const { actions, results, type, predicate } = context;
  const expected = actions.filter((item) => item.type === type).length;
  const actual = results.filter((item) => item.type === type);
  return expected === actual.length && actual.every(predicate);
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
  if (!context.plan.actions.some((item) => ['APPLY_VARIANT_TOPOLOGY', 'REWIRE_VARIANT_TOPOLOGY'].includes(item.type))) return true;
  return (await corridorStore.listGraph(context.options.db, context.input.metapopulationId)).length > 0;
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
