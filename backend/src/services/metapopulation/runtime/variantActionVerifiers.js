'use strict';

const store = require('../metapopulationStore');
const corridorStore = require('../migration/corridorStore');
const migrationStore = require('../migration/migrationStore');
const { RUNTIME_MARKERS } = require('./variantActionExecutors');

async function verifyVariantActions(context) {
  const { plan, input, options } = context;
  const session = await store.loadSession(options.db, input.metapopulationId);
  const results = context.execution.results || [];
  return verifyPatchActions(plan.actions, session) && verifySearchAndEvolution(plan.actions, results)
    && verifyTrials({ actions: plan.actions, results, db: options.db, metapopulationId: input.metapopulationId })
    && verifyMarkerReceipts(plan.actions, results) && await verifyCultureOffers({ plan, results, db: options.db, metapopulationId: input.metapopulationId });
}

function verifyMarkerReceipts(actions, results) {
  return Object.keys(RUNTIME_MARKERS).every((type) => verifyMarkerFamily(actions, results, type));
}

function verifyMarkerFamily(actions, results, type) {
  const expected = actions.filter((item) => item.type === type);
  if (!expected.length) return true;
  const actual = results.filter((item) => item.type === type);
  return actual.length === expected.length && actual.every((item) => checkMarkerReceipt(type, item));
}

function checkMarkerReceipt(type, item) {
  const predicate = MARKER_RECEIPTS[type];
  return typeof predicate === 'function' ? predicate(item) : true;
}

const MARKER_RECEIPTS = Object.freeze({
  TRIGGER_ISLAND_MIGRATION: (item) => item.triggered === true && Number.isFinite(item.interval),
  TRIGGER_STEPPING_STONE_MIGRATION: (item) => item.triggered === true && Number.isFinite(item.interval),
  ACTIVATE_RESERVE_CORRIDOR: (item) => typeof item.activated === 'boolean' && (item.activated || typeof item.reason === 'string'),
  DEPLOY_FOUNDER: (item) => typeof item.deployed === 'boolean' && (item.deployed ? typeof item.colonizationId === 'string' : typeof item.reason === 'string'),
  PROTECT_SOURCE: (item) => item.protected === true && typeof item.demeId === 'string',
  RECOVERY_SLA_BREACH: (item) => item.breached === true && typeof item.demeId === 'string',
  ROTATE_SOURCE_SINK_ROLES: (item) => Number.isInteger(item.rotated) && Array.isArray(item.changes),
  MIGRATE_ISLAND_ELITE: (item) => item.migrated === true && typeof item.propaguleId === 'string',
  PROOF_OF_DATA_MINIMIZATION: (item) => item.proven === true && typeof item.proofId === 'string',
  REQUIRE_RECEIVER_ATTESTATION: (item) => item.required === true && typeof item.propaguleId === 'string',
  STAGE_FOUNDER_RESERVE: (item) => item.staged === true && Number.isFinite(item.deficit),
  DIVERSITY_FLOOR_BREACH: (item) => item.breached === true && Number.isFinite(item.currentDiversity),
  ALLOW_CONTROLLED_EXTINCTION: (item) => item.allowed === true && typeof item.demeId === 'string',
  PROTECT_FROM_EXTINCTION: (item) => item.protected === true && typeof item.demeId === 'string',
  REJECT_FEDERATED_TRANSFER: (item) => item.rejected === true && typeof item.reason === 'string',
  REDACT_PROPAGULE: (item) => item.redacted === true,
  REQUIRE_SOVEREIGNTY_ACKNOWLEDGMENT: (item) => item.required === true && typeof item.demeId === 'string',
  MAINTAIN_RESIDENT_DAEMON: (item) => typeof item.maintained === 'boolean' && typeof item.demeId === 'string',
  UPDATE_DEME_MEMORY: (item) => item.updated === true && typeof item.memoryRef === 'string',
  INTER_MISSION_MIGRATION: (item) => item.scheduled === true && typeof item.migration === 'object',
  LOCAL_REPRODUCTION: (item) => item.recorded === true && typeof item.demeId === 'string',
  CHECK_SPECIATION: (item) => item.checked === true,
  TRANSFER_CULTURE: (item) => typeof item.offered === 'boolean' && (item.offered ? typeof item.migrationId === 'string' : typeof item.reason === 'string'),
  REJECT_CULTURE_TRANSFER: (item) => item.rejected === true && typeof item.reason === 'string',
  MUTATE_CULTURE: (item) => typeof item.mutated === 'boolean' && (item.mutated ? Number.isSafeInteger(item.newVersion) : typeof item.reason === 'string'),
  BUILD_CULTURAL_PHYLOGENY: (item) => Array.isArray(item.nodes) && Number.isSafeInteger(item.count),
  COLLAPSE_DETECTED_POPULATE_VACANCY: (item) => Array.isArray(item.results),
  CREATE_EPHEMERAL_PATCH_LEASE: (item) => typeof item.leaseId === 'string' && typeof item.patchId === 'string',
  RENEW_EPHEMERAL_PATCH_LEASE: (item) => typeof item.leaseId === 'string' && typeof item.patchId === 'string' && item.renewed === true,
  REGISTER_RESIDENT_DAEMON: (item) => typeof item.daemonId === 'string' && typeof item.leaseId === 'string',
  MAINTAIN_RESIDENT_DAEMON_CYCLE: (item) => typeof item.maintained === 'boolean' && typeof item.demeId === 'string',
  EXPIRE_RESIDENT_DAEMON: (item) => item.deactivated === true && typeof item.demeId === 'string',
  STAGE_FOUNDER_RESERVE: (item) => item.staged === true && Number.isFinite(item.deficit),
  PROOF_OF_DATA_MINIMIZATION: (item) => item.recorded === true && typeof item.proofId === 'string',
  REQUIRE_RECEIVER_ATTESTATION: (item) => item.required === true && typeof item.propaguleId === 'string',
});

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
