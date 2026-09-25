'use strict';

/**
 * @file topologySessionTools.js
 * @description MCP-facing operations for durable topology sessions. Loads the
 * session record to know its topology and dispatches to the matching
 * coordination service, so workers in other processes can contribute.
 */
const store = require('./topologySessionStore');
const syncytium = require('./syncytiumCoordinationService');
const rhizome = require('./rhizomeCoordinationService');
const biome = require('./biomeCoordinationService');

async function rhizomeSnapshot(db, sessionId) {
  const graph = await rhizome.graphSnapshot(sessionId, { db });
  return { sessionId, graph, ...(await rhizome.coherence(sessionId, { db })) };
}

async function applySyncytium(db, sessionId, args) {
  const options = { db, domainId: args.domain_id };
  if (args.transaction) return syncytium.applyTransaction(sessionId, args.transaction, options);
  if (!args.op) throw Object.assign(new Error('Syncytium apply requires a SharedOperation in op.'), { code: 'SYNCYTIUM_OPERATION_INVALID' });
  return syncytium.applyOperation(sessionId, { ...args.op, domainId: args.domain_id || args.op.domainId }, options);
}

async function syncytiumSchema(db, sessionId) {
  const snapshot = await syncytium.snapshot(sessionId, { db });
  return { sessionId, schema: snapshot.schema };
}

async function syncytiumDomains(db, sessionId) {
  const snapshot = await syncytium.snapshot(sessionId, { db });
  return { sessionId, domains: snapshot.domains };
}

async function syncytiumHistory(db, sessionId) {
  return syncytium.inspectHistory(sessionId, { db });
}

async function explainSyncytium(db, sessionId, args) {
  return syncytium.explain(sessionId, { path: args.path, version: args.version, options: { db } });
}

async function branchSyncytium(db, sessionId, args) {
  const branch = args.branch || {};
  const branchId = String(args.branch_id || branch.branch_id || branch.branchId || '').trim();
  const created = await syncytium.createSpeculativeBranch(sessionId, { branchId, options: { db } });
  const operations = Array.isArray(branch.operations) ? branch.operations : [];
  const applied = [];
  for (const operation of operations) {
    applied.push(await syncytium.applySpeculativeOperation(sessionId, { branchId, operation, options: { db } }));
  }
  return { branch: created, applied };
}

async function promoteSyncytium(db, sessionId, args) {
  return syncytium.promoteSpeculativeBranch(sessionId, { branchId: args.branch_id, options: { db } });
}

async function invariantsSyncytium(db, sessionId) {
  const snapshot = await syncytium.snapshot(sessionId, { db });
  return { definitions: snapshot.schema?.invariants || {}, receipts: snapshot.shared.invariants || [] };
}

async function conflictsSyncytium(db, sessionId, args) {
  return syncytium.inspectConflicts(sessionId, { operation: args.op, options: { db } });
}

async function replicasSyncytium(db, sessionId) {
  return syncytium.inspectReplicas(sessionId, { db });
}

async function healthSyncytium(db, sessionId) {
  const snapshot = await syncytium.snapshot(sessionId, { db });
  const replicas = await syncytium.inspectReplicas(sessionId, { db });
  return { consistency: snapshot.consistency, replicas };
}

async function morphogenesisSyncytium(db, sessionId, args) {
  return syncytium.analyzeSessionMorphogenesis(sessionId, {
    ...(args.signals || {}), options: { db }
  });
}

async function depositRhizome(db, sessionId, args) {
  return rhizome.depositTrail(sessionId, args.marker || args.key, {
    db, amount: args.amount, isRepellent: args.is_repellent, kind: args.trail_kind,
    capability: args.capability, source: args.source, evidenceRefs: args.evidence_refs,
    confidence: args.confidence, halfLifeMs: args.half_life_ms, scope: args.scope
  });
}

async function selectRhizomeMember(db, sessionId, args) {
  return rhizome.routeDirectMember(sessionId, args.need, { db });
}

async function routeRhizomeNeed(db, sessionId, args) {
  return rhizome.routeToCapability(sessionId, args.need || {}, { db });
}

async function evaporateRhizomeTrails(db, sessionId) {
  return rhizome.evaporateTrails(sessionId, { db });
}

async function recordRhizomeOutcome(db, sessionId, args) {
  const trustedVerifierDigests = String(process.env.GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return rhizome.recordRouteOutcome(sessionId, args.receipt || {}, { db, trustedVerifierDigests });
}

async function updateRhizomeConductivity(db, sessionId, args) {
  return rhizome.runConductivityStep(sessionId, { db, alpha: args.alpha, beta: args.beta, decay: args.decay });
}

async function integrateRhizomeBridge(db, sessionId, args) {
  const trustedVerifierDigests = String(process.env.GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return rhizome.integrateBridge(sessionId, { bridge: args.bridge || {}, proof: args.proof || {} }, { db, trustedVerifierDigests });
}

async function publishRhizomeSignal(db, sessionId, args) {
  return rhizome.signalCapability(sessionId, args.signal || {}, { db });
}

async function manageRhizomeLocus(db, sessionId, args) {
  return rhizome.manageCoordinationLocus(sessionId, {
    action: args.action, locus: args.locus, locusId: args.locus_id
  }, { db });
}

async function repairRhizomeRoute(db, sessionId, args) {
  const trustedVerifierDigests = String(process.env.GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return rhizome.repairRoute(sessionId, { need: args.need || {}, receipt: args.receipt || {} }, { db, trustedVerifierDigests });
}

async function assessRhizomeHealth(db, sessionId) {
  return rhizome.graphHealth(sessionId, { db });
}

async function inspectRhizomePruning(db, sessionId, args) {
  return rhizome.inspectPruning(sessionId, {
    now: args.now, maxIdleMs: args.max_idle_ms, utilityThreshold: args.utility_threshold, db
  });
}

async function stepRhizome(db, sessionId, args) {
  return rhizome.runSlimeMouldStep(sessionId, args.edges || [], { db });
}

async function inspectRhizomeGap(db, sessionId, args) {
  return rhizome.inspectCapabilityNeed(sessionId, args.need || {}, { db });
}

async function planRhizomeGrowth(db, sessionId, args) {
  return rhizome.planGrowth(sessionId, args.gap_id, { db, threshold: args.threshold, candidates: args.candidates || [] });
}

async function allocateBiome(db, sessionId, args) {
  return biome.allocateSessionResources(sessionId, args.populations || [], { db, totalBudget: args.total_budget, minimumPerPopulation: args.minimum_per_population });
}

async function forageBiome(db, sessionId, args) {
  return biome.forageSession(sessionId, args.patch_history || [], {
    db, iteration: args.iteration, elapsedTimeSec: args.elapsed_time_sec,
    currentPatchId: args.current_patch_id, currentDescriptor: args.current_descriptor,
    currentMarginalReturn: args.current_marginal_return, alternativePatch: args.alternative_patch,
    alternativePatches: args.alternative_patches, switchCost: args.switch_cost,
    populationId: args.population_id, individualId: args.individual_id,
    migrationCost: args.migration_cost, currentSpace: args.current_space,
    stepsWithoutProgress: args.steps_without_progress
  });
}

async function assessBiome(db, sessionId, args) {
  return biome.assessSessionHealth(sessionId, args.observations || [], { db });
}

const OPERATIONS = {
  syncytium: {
    snapshot: (db, id) => syncytium.snapshot(id, { db }), apply: applySyncytium,
    schema: syncytiumSchema, domains: syncytiumDomains, history: syncytiumHistory,
    explain: explainSyncytium, branch: branchSyncytium, promote: promoteSyncytium,
    invariants: invariantsSyncytium, conflicts: conflictsSyncytium,
    replicas: replicasSyncytium, health: healthSyncytium,
    morphogenesis: morphogenesisSyncytium
  },
  rhizome: { snapshot: rhizomeSnapshot, deposit: depositRhizome, direct_member: selectRhizomeMember, route: routeRhizomeNeed, slime: stepRhizome, gap: inspectRhizomeGap, grow: planRhizomeGrowth, evaporate: evaporateRhizomeTrails, record_outcome: recordRhizomeOutcome, conductivity: updateRhizomeConductivity, bridge: integrateRhizomeBridge, signal: publishRhizomeSignal, locus: manageRhizomeLocus, repair: repairRhizomeRoute, health: assessRhizomeHealth, prune: inspectRhizomePruning },
  biome: { snapshot: (db, id) => biome.sessionSnapshot(id, { db }), allocate: allocateBiome, forage: forageBiome, health: assessBiome }
};

function operationHandler(topology, operation) {
  return OPERATIONS[topology]?.[operation];
}

async function applyTopologyOperation(db, args = {}) {
  const sessionId = String(args.session_id || args.sessionId || '').trim();
  const operation = String(args.operation || '').trim().toLowerCase();
  if (!sessionId) throw new Error('session_id is required.');
  const record = await store.load(db, sessionId);
  if (!record) throw new Error(`Unknown topology session '${sessionId}'.`);
  const handler = operationHandler(record.topology, operation);
  if (handler) return handler(db, sessionId, args);
  throw new Error(`Unsupported operation '${operation}' for ${record.topology} session.`);
}

module.exports = { applyTopologyOperation };
