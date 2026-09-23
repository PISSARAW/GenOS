'use strict';

/**
 * @file syncytiumCoordinationService.js
 * @description Syncytium coordination: a live CRDT shared state plus a
 * cytoplasm whose ionic fluxes drive the collective membrane potential.
 * Sessions are persisted so workers (separate processes) can apply operations.
 */
const syncytiumService = require('./syncytiumService');
const { createSyncytiumCrdt } = require('./syncytiumCrdtService');
const { createCytoplasm } = require('./syncytiumCytoplasmService');
const topologyCapabilityService = require('./topologyCapabilityService');
const store = require('./topologySessionStore');

const sessions = new Map();
const DEFAULT_ORGANIZATION = 'memory_compilation';

function serialize(session) {
  return {
    mission: session.mission,
    recommended: session.recommended,
    members: session.members,
    organization: session.organization,
    ops: session.crdt.getHistory(),
    fluxOps: session.fluxOps
  };
}

function rehydrate(record) {
  const state = record.state || {};
  const organization = state.organization || DEFAULT_ORGANIZATION;
  const session = {
    sessionId: record.id,
    mission: state.mission || '',
    recommended: state.recommended === true,
    members: Array.isArray(state.members) ? state.members : [],
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'syncytium', organization }),
    crdt: createSyncytiumCrdt(),
    cytoplasm: createCytoplasm(),
    fluxOps: []
  };
  for (const op of state.ops || []) session.crdt.applyOp(op);
  for (const flux of state.fluxOps || []) {
    session.cytoplasm.propagateIonicFlux(flux.ion, Number(flux.deltaFlux) || 0, flux.agentId);
    session.fluxOps.push(flux);
  }
  return session;
}

async function persist(db, session) {
  if (!db) return;
  await store.save(db, { id: session.sessionId, topology: 'syncytium', state: serialize(session) }).catch(() => {});
}

async function createSession(mission, options = {}) {
  const sessionId = `syncytium-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const session = {
    sessionId,
    mission: String(mission || ''),
    recommended: syncytiumService.analyzeMission(mission).recommended,
    members: syncytiumService.compose(mission),
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'syncytium', organization }),
    crdt: createSyncytiumCrdt(),
    cytoplasm: createCytoplasm(),
    fluxOps: []
  };
  sessions.set(sessionId, session);
  await persist(options.db, session);
  return session;
}

async function getSession(sessionId, db) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);
  if (!db) throw Object.assign(new Error(`Unknown syncytium session '${sessionId}'.`), { code: 'SYNCYTIUM_SESSION_UNKNOWN' });
  const record = await store.load(db, sessionId);
  if (!record || record.topology !== 'syncytium') throw Object.assign(new Error(`Unknown syncytium session '${sessionId}'.`), { code: 'SYNCYTIUM_SESSION_UNKNOWN' });
  const session = rehydrate(record);
  sessions.set(sessionId, session);
  return session;
}

function isIonicFlux(op) {
  return Boolean(op && op.kind && typeof op.kind === 'object' && typeof op.kind.type === 'string' && op.kind.type.startsWith('flux_'));
}

function assessConsistency(session) {
  const snapshot = session.crdt.getSnapshot();
  const failed = snapshot.invariants.filter((invariant) => !invariant.passed);
  const membranePotentialMv = session.cytoplasm.snapshotState().membranePotentialMv;
  const unstable = membranePotentialMv < -85 || membranePotentialMv > 30;
  return {
    verdict: failed.length ? 'divergent' : (unstable ? 'unstable' : 'consistent'),
    failedInvariants: failed.map((invariant) => invariant.name),
    membranePotentialMv,
    step: snapshot.step,
    totalOps: snapshot.totalOps,
    textLength: snapshot.textContent.length
  };
}

async function applyOperation(sessionId, op, options = {}) {
  const session = await getSession(sessionId, options.db);
  if (isIonicFlux(op)) {
    const flux = { ion: op.kind.type.slice('flux_'.length), deltaFlux: Number(op.kind.deltaFlux) || 0, agentId: op.agentId };
    session.fluxOps.push(flux);
    const result = { sessionId, ion: session.cytoplasm.propagateIonicFlux(flux.ion, flux.deltaFlux, flux.agentId), consistency: assessConsistency(session) };
    await persist(options.db, session);
    return result;
  }
  session.crdt.applyOp(op);
  const result = { sessionId, snapshot: session.crdt.getSnapshot(), consistency: assessConsistency(session) };
  await persist(options.db, session);
  return result;
}

async function snapshot(sessionId, options = {}) {
  const session = await getSession(sessionId, options.db);
  return { sessionId, shared: session.crdt.getSnapshot(), cytoplasm: session.cytoplasm.snapshotState(), consistency: assessConsistency(session) };
}

async function closeSession(sessionId, options = {}) {
  const existed = sessions.delete(sessionId);
  if (options.db) await store.remove(options.db, sessionId).catch(() => {});
  return true;
}

module.exports = { createSession, applyOperation, snapshot, assessConsistency, closeSession, isIonicFlux, rehydrate };
