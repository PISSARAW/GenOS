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
const ROLE_CAPABILITIES = Object.freeze({
  rootless_coordinator: ['coordination'],
  capability_offshoot: ['mission_execution', 'specialized_execution'],
  local_bridge: ['integration'],
  boundary_scout: ['observation', 'capability_discovery']
});
const sessions = new Map();

function normalizeMembers(members) {
  const roles = new Set();
  return members.map((member) => {
    const role = String(member?.role || '').trim();
    const capabilities = member?.capabilities || ROLE_CAPABILITIES[role];
    if (!role || roles.has(role) || !Array.isArray(capabilities) || !capabilities.length || capabilities.some((item) => typeof item !== 'string' || !item.trim())) {
      throw Object.assign(new Error('Rhizome members require unique roles and non-empty typed capabilities.'), { code: 'RHIZOME_MEMBER_INVALID' });
    }
    roles.add(role);
    return { ...member, role, capabilities: [...new Set(capabilities.map((item) => item.trim()))] };
  });
}

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
    members: normalizeMembers(Array.isArray(state.members) ? state.members : [])
  };
}

async function persist(db, session) {
  if (!db) return;
  await store.save(db, { id: session.sessionId, topology: 'rhizome', state: serialize(session) });
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
    members: normalizeMembers(Array.isArray(options.members) ? options.members : biologicalModeService.compose('rhizome', goal))
  };
  sessions.set(session.sessionId, session);
  await persist(options.db, session);
  return session;
}

async function getSession(sessionId, db) {
  if (db) {
    const record = await store.load(db, sessionId);
    if (record && record.topology === 'rhizome') {
      const session = rehydrate(record);
      sessions.set(sessionId, session);
      return session;
    }
  }
  const session = sessions.get(sessionId);
  if (session) return session;
  throw Object.assign(new Error(`Unknown rhizome session '${sessionId}'.`), { code: 'RHIZOME_SESSION_UNKNOWN' });
}

async function depositTrail(sessionId, marker, options = {}) {
  const session = await getSession(sessionId, options.db);
  const trail = session.matrix.depositTrace(String(marker), Number(options.amount) || 0, options.isRepellent === true);
  await persist(options.db, session);
  return { sessionId, marker: String(marker), trail, dominant: session.matrix.selectDominantPath() };
}

async function routeToCapability(sessionId, need, options = {}) {
  const session = await getSession(sessionId, options.db);
  const target = String(need || '').trim();
  if (!target) throw Object.assign(new Error('A non-empty capability need is required.'), { code: 'RHIZOME_NEED_REQUIRED' });
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const alternatives = routeAlternatives(session, target, now);
  return routeDecision({ sessionId, target, alternatives, coherent: options.coherent });
}

function routeAlternatives(session, target, now) {
  const capable = session.members.filter((member) => member.role === target || (Array.isArray(member.capabilities) && member.capabilities.includes(target)));
  const marker = `route:capability/${target}`;
  return capable.map((member) => {
    const trail = session.matrix.getDecayedIntensity(marker, now);
    const routeMarker = `route:member/${member.role}/${target}`;
    const memberTrail = session.matrix.getDecayedIntensity(routeMarker, now);
    return { role: member.role, score: Number((trail + memberTrail).toFixed(4)), signals: [
      ...(trail ? [{ marker, intensity: trail }] : []),
      ...(memberTrail ? [{ marker: routeMarker, intensity: memberTrail }] : [])
    ] };
  }).sort((left, right) => right.score - left.score || left.role.localeCompare(right.role));
}

function routeDecision({ sessionId, target, alternatives, coherent }) {
  if (!alternatives.length) return { sessionId, need: target, branch: null, routed: false, verdict: 'no_capable_member', alternatives: [] };
  const best = alternatives[0];
  if (best.score < 0) return { sessionId, need: target, branch: null, routed: false, verdict: 'repelled', alternatives };
  if (coherent === false) return { sessionId, need: target, branch: null, routed: false, verdict: 'incoherent', alternatives };
  return { sessionId, need: target, branch: best.role, routed: true, verdict: 'routed', score: best.score, signals: best.signals, alternatives };
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
