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
const persistence = require('./syncytiumPersistenceService');
const schemaService = require('./syncytiumSchemaService');
const nuclearDomains = require('./syncytium/domains/nuclearDomainService');
const mutationAuthority = require('./syncytium/security/mutationAuthorityService');
const operationClassifier = require('./syncytium/consistency/operationClassifier');
const consistencyZones = require('./syncytium/consistency/consistencyZoneService');
const coordinationRouter = require('./syncytium/consistency/coordinationRouter');
const invariantGate = require('./syncytium/invariants/invariantGate');
const semanticConflicts = require('./syncytium/conflicts/semanticConflictService');
const transactionService = require('./syncytium/transactions/transactionService');

const sessions = new Map();
const DEFAULT_ORGANIZATION = 'memory_compilation';

function serialize(session) {
  return {
    mission: session.mission,
    recommended: session.recommended,
    members: session.members,
    organization: session.organization,
    schema: session.schema,
    domains: session.domains,
    ops: session.crdt.getHistory(),
    fluxOps: session.fluxOps
  };
}

function rehydrate(record) {
  const state = record.state || {};
  const organization = state.organization || DEFAULT_ORGANIZATION;
  const session = {
    sessionId: record.id,
    revision: sessionRevision(record),
    persisted: true,
    mission: state.mission || '',
    recommended: state.recommended === true,
    members: Array.isArray(state.members) ? state.members : [],
    organization,
    schema: schemaService.compile(state.schema),
    domains: nuclearDomains.compile(state.domains),
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

function sessionRevision(record) {
  return Number.isInteger(record.revision) ? record.revision : 0;
}

async function persist(db, session) {
  if (!db) {
    session.pendingOperation = null;
    session.pendingOperations = null;
    return;
  }
  try {
    const record = { sessionId: session.sessionId, revision: session.revision, state: serialize(session) };
    if (!session.persisted) {
      session.revision = await persistence.createSession(db, record);
      session.persisted = true;
    } else {
      const pending = session.pendingOperations || session.pendingOperation;
      session.revision = (await persistence.commitSession(db, record, pending)).revision;
    }
    session.pendingOperation = null;
    session.pendingOperations = null;
  } catch (cause) {
    if (cause.code === 'SYNCYTIUM_SESSION_CONFLICT') throw cause;
    throw Object.assign(new Error('Syncytium session persistence failed.', { cause }), { code: 'SYNCYTIUM_PERSISTENCE_FAILURE' });
  }
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
    domains: nuclearDomains.compile(options.nuclearDomains || options.domains),
    revision: 0,
    persisted: false,
    schema: schemaService.compile(options.schema),
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
  if (db) {
    const record = await persistence.loadSession(db, sessionId);
    if (!record) throw Object.assign(new Error(`Unknown syncytium session '${sessionId}'.`), { code: 'SYNCYTIUM_SESSION_UNKNOWN' });
    const session = rehydrate(record);
    sessions.set(sessionId, session);
    return session;
  }
  if (!sessions.has(sessionId)) throw Object.assign(new Error(`Unknown syncytium session '${sessionId}'.`), { code: 'SYNCYTIUM_SESSION_UNKNOWN' });
  return sessions.get(sessionId);
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
  const admission = schemaService.admitOperation(session.schema, op);
  op = admission.operation;
  const decision = operationClassifier.classify(session.schema, op);
  const context = { sessionId, session, op, options, admission, decision };
  return coordinationRouter.run(decision, sessionId, async () => {
    if (decision.coordinationRequired) context.session = await getSession(sessionId, options.db);
    return applyAdmittedOperation(context);
  });
}

async function applyAdmittedOperation(context) {
  const { sessionId, session, op, options, admission, decision } = context;
  mutationAuthority.authorize(session.domains, session.schema, op);
  if (op?.opId && (session.crdt.hasOpId(op.opId) || session.fluxOps.some((flux) => flux.opId === op.opId))) {
    return { sessionId, snapshot: session.crdt.getSnapshot(), schema: session.schema, warnings: admission.warnings, consistency: assessConsistency(session), coordination: decision, duplicate: true };
  }
  if (op.fieldType === 'ESCROW_COUNTER' && op.kind?.action === 'allocate') {
    throw Object.assign(new Error('Escrow allocation changes must use applyTransaction.'), { code: 'SYNCYTIUM_TRANSACTION_REQUIRED' });
  }
  consistencyZones.validateMutation(decision.zone, op, session.crdt.getSnapshot().sharedFields);
  if (isIonicFlux(op)) {
    const flux = { opId: op.opId, ion: op.kind.type.slice('flux_'.length), deltaFlux: Number(op.kind.deltaFlux) || 0, agentId: op.agentId };
    session.fluxOps.push(flux);
    const result = { sessionId, ion: session.cytoplasm.propagateIonicFlux(flux.ion, flux.deltaFlux, flux.agentId), schema: session.schema, warnings: admission.warnings, consistency: assessConsistency(session), coordination: decision };
    session.pendingOperation = op;
    await persist(options.db, session);
    return result;
  }
  semanticConflicts.assertNoBlockingConflicts({
    operation: op, history: session.crdt.getHistory(), schema: session.schema, domains: session.domains
  });
  const invariantReceipts = invariantGate.evaluateCandidate({ schema: session.schema, crdt: session.crdt, operation: op });
  session.crdt.applyOp(op);
  const result = { sessionId, snapshot: session.crdt.getSnapshot(), schema: session.schema, warnings: admission.warnings, consistency: assessConsistency(session), coordination: decision, invariants: invariantReceipts };
  session.pendingOperation = session.crdt.getHistory().at(-1);
  await persist(options.db, session);
  return result;
}

async function snapshot(sessionId, options = {}) {
  const session = await getSession(sessionId, options.db);
  return { sessionId, shared: session.crdt.getSnapshot(), schema: session.schema, domains: session.domains, cytoplasm: session.cytoplasm.snapshotState(), consistency: assessConsistency(session) };
}

async function applyTransaction(sessionId, transaction, options = {}) {
  return transactionService.apply({
    sessionId,
    transaction,
    options,
    getSession,
    persist: (session) => persist(options.db, session)
  });
}

async function closeSession(sessionId, options = {}) {
  const existed = sessions.delete(sessionId);
  if (options.db) await persistence.removeSession(options.db, sessionId);
  return true;
}

module.exports = { createSession, applyOperation, applyTransaction, snapshot, assessConsistency, closeSession, isIonicFlux, rehydrate };
