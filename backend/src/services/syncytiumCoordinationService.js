'use strict';

/**
 * @file syncytiumCoordinationService.js
 * @description Syncytium coordination: a live CRDT shared state plus a
 * cytoplasm whose ionic fluxes drive the collective membrane potential. It
 * exposes session creation, operation application and a consistency verdict
 * so the Syncytium topology is more than role names.
 */
const syncytiumService = require('./syncytiumService');
const { createSyncytiumCrdt } = require('./syncytiumCrdtService');
const { createCytoplasm } = require('./syncytiumCytoplasmService');
const topologyCapabilityService = require('./topologyCapabilityService');

const sessions = new Map();
const DEFAULT_ORGANIZATION = 'memory_compilation';

function createSession(mission, options = {}) {
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
    cytoplasm: createCytoplasm()
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw Object.assign(new Error(`Unknown syncytium session '${sessionId}'.`), { code: 'SYNCYTIUM_SESSION_UNKNOWN' });
  return session;
}

function isIonicFlux(op) {
  return Boolean(op && op.kind && typeof op.kind.type === 'string' && op.kind.type.startsWith('flux_'));
}

function applyOperation(sessionId, op) {
  const session = getSession(sessionId);
  if (isIonicFlux(op)) {
    const ion = op.kind.type.slice('flux_'.length);
    return { sessionId, ion: session.cytoplasm.propagateIonicFlux(ion, Number(op.kind.deltaFlux) || 0, op.agentId), consistency: assessConsistency(session) };
  }
  session.crdt.applyOp(op);
  return { sessionId, snapshot: session.crdt.getSnapshot(), consistency: assessConsistency(session) };
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

function snapshot(sessionId) {
  const session = getSession(sessionId);
  return { sessionId, shared: session.crdt.getSnapshot(), cytoplasm: session.cytoplasm.snapshotState(), consistency: assessConsistency(session) };
}

function closeSession(sessionId) {
  return sessions.delete(sessionId);
}

module.exports = { createSession, applyOperation, snapshot, assessConsistency, closeSession, isIonicFlux };
