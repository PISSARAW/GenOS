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
const DEFAULT_HALF_LIFE_MS = 60000;
const MIN_HALF_LIFE_MS = 1;
const MAX_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TRAIL_MARKERS = 500;
const MAX_TRAIL_AMOUNT = 100;
const ROLE_CAPABILITIES = Object.freeze({
  rootless_coordinator: ['coordination'],
  capability_offshoot: ['mission_execution', 'specialized_execution'],
  local_bridge: ['integration', 'specialized_execution'],
  boundary_scout: ['observation', 'capability_discovery']
});
const sessions = new Map();

function normalizeMembers(members, authorizedRoles = Object.keys(ROLE_CAPABILITIES)) {
  const roles = new Set();
  const authorized = new Set(authorizedRoles);
  const knownCapabilities = new Set(Object.values(ROLE_CAPABILITIES).flat());
  return members.map((member) => {
    const role = String(member?.role || '').trim();
    const capabilities = member?.capabilities || ROLE_CAPABILITIES[role];
    if (!role || !authorized.has(role) || roles.has(role) || !Array.isArray(capabilities) || !capabilities.length || capabilities.some((item) => typeof item !== 'string' || !knownCapabilities.has(item.trim()))) {
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
    halfLifeMs: session.matrix.halfLifeMs,
    members: session.members,
    deposits: [...session.deposits],
    trails: [...session.matrix.trails.entries()],
    oscillators: [...session.matrix.oscillators.entries()]
  };
}

function rehydrate(record) {
  const state = record.state || {};
  const organization = state.organization || DEFAULT_ORGANIZATION;
  const matrix = createSwarmMatrix(state.halfLifeMs || DEFAULT_HALF_LIFE_MS);
  restoreEntries(matrix.trails, state.trails);
  restoreEntries(matrix.oscillators, state.oscillators);
  return {
    sessionId: record.id,
    persistVersion: record.storeVersion,
    mission: state.mission || '',
    organization,
    halfLifeMs: matrix.halfLifeMs,
    deposits: new Set(state.deposits || []),
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix,
    members: normalizeMembers(Array.isArray(state.members) ? state.members : [])
  };
}

function restoreEntries(target, entries) {
  for (const [key, value] of entries || []) target.set(key, value);
}

async function persist(db, session) {
  if (!db) return;
  await store.save(db, { id: session.sessionId, topology: 'rhizome', state: serialize(session), expectedVersion: session.persistVersion || 0 });
  session.persistVersion = (session.persistVersion || 0) + 1;
}

async function composeRhizome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Rhizome mission is required.'), { code: 'RHIZOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const halfLifeMs = options.halfLifeMs === undefined ? DEFAULT_HALF_LIFE_MS : options.halfLifeMs;
  if (!Number.isFinite(halfLifeMs) || halfLifeMs < MIN_HALF_LIFE_MS || halfLifeMs > MAX_HALF_LIFE_MS) {
    throw Object.assign(new Error('Rhizome trail half-life is outside its allowed bounds.'), { code: 'RHIZOME_HALF_LIFE_INVALID' });
  }
  const session = {
    sessionId: `rhizome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    persistVersion: 0,
    mission: goal,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix: createSwarmMatrix(halfLifeMs, options.clock),
    deposits: new Set(),
    members: normalizeMembers(biologicalModeService.compose('rhizome', goal))
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
  const key = String(marker || '').trim();
  const amount = options.amount;
  validateTrailDeposit(session, key, amount);
  const operationId = String(options.operationId || `legacy:${key}:${amount}:${options.isRepellent === true}`);
  if (session.deposits.has(operationId)) return { sessionId, marker: key, trail: session.matrix.trails.get(key), dominant: session.matrix.selectDominantPath(), idempotentReplay: true };
  const trail = session.matrix.depositTrace(key, amount, options.isRepellent === true);
  session.deposits.add(operationId);
  await persist(options.db, session);
  return { sessionId, marker: String(marker), trail, dominant: session.matrix.selectDominantPath() };
}

function validateTrailDeposit(session, key, amount) {
  if (key.length === 0 || key.length > 200 || !Number.isFinite(amount) || amount <= 0 || amount > MAX_TRAIL_AMOUNT) {
    throw Object.assign(new Error('Rhizome trail marker or intensity is outside its allowed bounds.'), { code: 'RHIZOME_TRAIL_INVALID' });
  }
  if (!session.matrix.trails.has(key) && session.matrix.trails.size >= MAX_TRAIL_MARKERS) {
    throw Object.assign(new Error('Rhizome trail marker limit reached.'), { code: 'RHIZOME_TRAIL_LIMIT' });
  }
}

async function routeToCapability(sessionId, need, options = {}) {
  const session = await getSession(sessionId, options.db);
  const target = String(need || '').trim();
  if (!target) throw Object.assign(new Error('A non-empty capability need is required.'), { code: 'RHIZOME_NEED_REQUIRED' });
  const now = Number.isFinite(options.now) ? options.now : undefined;
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
