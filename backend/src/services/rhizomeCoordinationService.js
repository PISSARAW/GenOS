'use strict';

/**
 * @file rhizomeCoordinationService.js
 * @description Rhizome coordination: a decentralized capability mesh directed
 * by stigmergic pheromone trails. Sessions are persisted so workers (separate
 * processes) can deposit trails and read the shared medium.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const { createSwarmMatrix } = require('./swarmStigmergyVectorService');
const swarmTopologyAlgorithms = require('./swarmTopologyAlgorithms');
const store = require('./topologySessionStore');

const DEFAULT_ORGANIZATION = 'mycelial_routing';
const sessions = new Map();

function serialize(session) {
  return {
    mission: session.mission,
    organization: session.organization,
    members: session.members,
    trails: [...session.matrix.trails.entries()],
    oscillators: [...session.matrix.oscillators.entries()]
  };
}

function rehydrate(record) {
  const state = record.state || {};
  const organization = state.organization || DEFAULT_ORGANIZATION;
  const matrix = createSwarmMatrix();
  for (const [marker, entry] of state.trails || []) matrix.trails.set(marker, entry);
  for (const [agentId, entry] of state.oscillators || []) matrix.oscillators.set(agentId, entry);
  return {
    sessionId: record.id,
    mission: state.mission || '',
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix,
    members: Array.isArray(state.members) ? state.members : []
  };
}

async function persist(db, session) {
  if (!db) return;
  await store.save(db, { id: session.sessionId, topology: 'rhizome', state: serialize(session) }).catch(() => {});
}

async function composeRhizome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Rhizome mission is required.'), { code: 'RHIZOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const session = {
    sessionId: `rhizome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mission: goal,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix: createSwarmMatrix(),
    members: biologicalModeService.compose('rhizome', goal)
  };
  sessions.set(session.sessionId, session);
  await persist(options.db, session);
  return session;
}

async function getSession(sessionId, db) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);
  if (!db) throw Object.assign(new Error(`Unknown rhizome session '${sessionId}'.`), { code: 'RHIZOME_SESSION_UNKNOWN' });
  const record = await store.load(db, sessionId);
  if (!record || record.topology !== 'rhizome') throw Object.assign(new Error(`Unknown rhizome session '${sessionId}'.`), { code: 'RHIZOME_SESSION_UNKNOWN' });
  const session = rehydrate(record);
  sessions.set(sessionId, session);
  return session;
}

async function depositTrail(sessionId, marker, options = {}) {
  const session = await getSession(sessionId, options.db);
  const trail = session.matrix.depositTrace(String(marker), Number(options.amount) || 0, options.isRepellent === true);
  await persist(options.db, session);
  return { sessionId, marker: String(marker), trail, dominant: session.matrix.selectDominantPath() };
}

async function routeToCapability(sessionId, need, options = {}) {
  const session = await getSession(sessionId, options.db);
  const target = String(need || '');
  const branch = session.members.find((member) => member.role === target || (member.capabilities || []).includes(target)) || null;
  return { sessionId, need: target, branch: branch ? branch.role : null, routed: Boolean(branch) };
}

async function coherence(sessionId, options = {}) {
  const session = await getSession(sessionId, options.db);
  return { sessionId, ...session.matrix.computeKuramotoOrder() };
}

async function runSlimeMouldStep(sessionId, edges, options = {}) {
  const session = await getSession(sessionId, options.db);
  const edgesResult = swarmTopologyAlgorithms.slimeMouldNetwork(edges, { matrix: session.matrix, ...options });
  await persist(options.db, session);
  return { sessionId, edges: edgesResult };
}

async function closeSession(sessionId, options = {}) {
  sessions.delete(sessionId);
  if (options.db) await store.remove(options.db, sessionId).catch(() => {});
  return true;
}

module.exports = { composeRhizome, depositTrail, routeToCapability, coherence, runSlimeMouldStep, closeSession, rehydrate };
