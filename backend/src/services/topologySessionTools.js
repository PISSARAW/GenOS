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
  return syncytium.applyOperation(sessionId, args.op || {}, { db });
}

async function depositRhizome(db, sessionId, args) {
  return rhizome.depositTrail(sessionId, args.marker || args.key, { db, amount: args.amount, isRepellent: args.is_repellent });
}

async function selectRhizomeMember(db, sessionId, args) {
  return rhizome.routeDirectMember(sessionId, args.need, { db });
}

 async function routeRhizomeNeed(db, sessionId, args) {
  return rhizome.routeToCapability(sessionId, args.need || {}, { db });
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
  return biome.forageSession(sessionId, args.patch_history || [], { db, iteration: args.iteration, elapsedTimeSec: args.elapsed_time_sec });
}

async function assessBiome(db, sessionId, args) {
  return biome.assessSessionHealth(sessionId, args.observations || [], { db });
}

const OPERATIONS = {
  syncytium: { snapshot: (db, id) => syncytium.snapshot(id, { db }), apply: applySyncytium },
  rhizome: { snapshot: rhizomeSnapshot, deposit: depositRhizome, direct_member: selectRhizomeMember, route: routeRhizomeNeed, slime: stepRhizome, gap: inspectRhizomeGap, grow: planRhizomeGrowth },
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
