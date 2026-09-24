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
const deltaRouter = require('./syncytium/sync/deltaRouter');
const projectionMaterializer = require('./syncytium/sync/projectionMaterializer');
const adaptiveSync = require('./syncytium/sync/adaptiveSyncService');
const reflexSignals = require('./syncytium/reflex/reflexSignalService');
const { createSessionHistoryService } = require('./syncytium/history/sessionHistoryService');
const offlineMutation = require('./syncytium/replicas/offlineMutationService');
const { createSyncytiumDiagnosticsService } = require('./syncytiumDiagnosticsService');
const { createSyncytiumSpeculationService } = require('./syncytiumSpeculationService');
const { createCodeVariantService } = require('./syncytium/variants/code/codeVariantService');
const { createVariantFacade } = require('./syncytium/variants/variantFacade');

const sessions = new Map();
const DEFAULT_ORGANIZATION = 'memory_compilation';
const sessionHistory = createSessionHistoryService({ getSession, persist });
const diagnostics = createSyncytiumDiagnosticsService({ getSession, applyOperation });
const speculation = createSyncytiumSpeculationService({ getSession, persist });

function serialize(session) {
  return {
    mission: session.mission,
    recommended: session.recommended,
    members: session.members,
    organization: session.organization,
    schema: session.schema,
    domains: session.domains,
    reflexSignals: session.reflexSignals,
    snapshots: session.snapshots,
    replicas: session.replicas,
    speculativeBranches: session.speculativeBranches,
    ops: session.crdt.getHistory(),
    crdtState: session.crdt.serialize(),
    fluxOps: session.fluxOps
  };
}

function rehydrate(record) {
  const state = record.state || {};
  const organization = state.organization || DEFAULT_ORGANIZATION;
  const session = createRestoredSession(record, state, organization);
  restoreSessionState(session, state);
  return session;
}

function createRestoredSession(record, state, organization) {
  return {
    sessionId: record.id,
    revision: sessionRevision(record),
    persisted: true,
    mission: state.mission || '',
    recommended: state.recommended === true,
    members: Array.isArray(state.members) ? state.members : [],
    organization,
    schema: schemaService.compile(state.schema),
    domains: nuclearDomains.compile(state.domains),
    reflexSignals: normalizeReflexSignals(state.reflexSignals),
    snapshots: Array.isArray(state.snapshots) ? state.snapshots : [],
    replicas: state.replicas && typeof state.replicas === 'object' ? state.replicas : {},
    speculativeBranches: state.speculativeBranches && typeof state.speculativeBranches === 'object' ? state.speculativeBranches : {},
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'syncytium', organization }),
    crdt: createSyncytiumCrdt(),
    cytoplasm: createCytoplasm(),
    fluxOps: []
  };
}

function restoreSessionState(session, state) {
  if (state.crdtState) session.crdt.restore(state.crdtState);
  else for (const op of state.ops || []) session.crdt.applyOp(op);
  for (const flux of state.fluxOps || []) {
    session.cytoplasm.propagateIonicFlux(flux.ion, Number(flux.deltaFlux) || 0, flux.agentId);
    session.fluxOps.push(flux);
  }
}

function normalizeReflexSignals(signals) {
  return Array.isArray(signals) ? signals : [];
}

function sessionRevision(record) {
  return Number.isInteger(record.revision) ? record.revision : 0;
}

async function persist(db, session) {
  if (!db) {
    session.pendingOperation = null;
    session.pendingOperations = null;
    session.pendingReflexSignal = null;
    session.pendingSnapshot = null;
    session.pendingCompaction = null;
    session.pendingReplicaEvent = null;
    return;
  }
  try {
    const record = {
      sessionId: session.sessionId,
      revision: session.revision,
      state: serialize(session),
      pendingReflexSignal: session.pendingReflexSignal,
      pendingSnapshot: session.pendingSnapshot,
      pendingCompaction: session.pendingCompaction,
      pendingReplicaEvent: session.pendingReplicaEvent
    };
    if (!session.persisted) {
      session.revision = await persistence.createSession(db, record);
      session.persisted = true;
    } else {
      const pending = session.pendingOperations || session.pendingOperation;
      session.revision = (await persistence.commitSession(db, record, pending)).revision;
    }
    session.pendingOperation = null;
    session.pendingOperations = null;
    session.pendingReflexSignal = null;
    session.pendingSnapshot = null;
    session.pendingCompaction = null;
    session.pendingReplicaEvent = null;
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
    reflexSignals: [],
    snapshots: [],
    replicas: {},
    speculativeBranches: {},
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
  const physiology = membranePotentialMv < -85 || membranePotentialMv > 30 ? 'unstable' : 'normal';
  return {
    verdict: failed.length ? 'divergent' : 'consistent',
    failedInvariants: failed.map((invariant) => invariant.name),
    membranePotentialMv,
    physiology,
    step: snapshot.step,
    totalOps: snapshot.totalOps,
    textLength: snapshot.textContent.length
  };
}

async function applyOperation(sessionId, op, options = {}) {
  const session = await getSession(sessionId, options.db);
  validateConsumerDomain(session, options.domainId);
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
    return operationResult(context, session.crdt.getSnapshot(), { duplicate: true });
  }
  if (op.fieldType === 'ESCROW_COUNTER' && op.kind?.action === 'allocate') {
    throw Object.assign(new Error('Escrow allocation changes must use applyTransaction.'), { code: 'SYNCYTIUM_TRANSACTION_REQUIRED' });
  }
  consistencyZones.validateMutation(decision.zone, op, session.crdt.getSnapshot().sharedFields);
  const offline = offlineMutation.stage({ session, options, operation: op });
  if (offline) return persistOfflineOperation(context, offline);
  if (isIonicFlux(op)) {
    const flux = { opId: op.opId, ion: op.kind.type.slice('flux_'.length), deltaFlux: Number(op.kind.deltaFlux) || 0, agentId: op.agentId };
    session.fluxOps.push(flux);
    const result = { sessionId, ion: session.cytoplasm.propagateIonicFlux(flux.ion, flux.deltaFlux, flux.agentId), schema: session.schema, warnings: admission.warnings, consistency: assessConsistency(session), coordination: decision, deltaRecipients: [] };
    session.pendingOperation = op;
    await persist(options.db, session);
    return result;
  }
  semanticConflicts.assertNoBlockingConflicts({
    operation: op, history: session.crdt.getHistory(), schema: session.schema, domains: session.domains
  });
  const invariantReceipts = invariantGate.evaluateCandidate({ schema: session.schema, crdt: session.crdt, operation: op });
  session.crdt.applyOp(op);
  const result = {
    sessionId,
    snapshot: projectedSnapshot(session, session.crdt.getSnapshot(), options.domainId),
    schema: projectedSchema(session, options.domainId),
    warnings: admission.warnings,
    consistency: assessConsistency(session),
    coordination: decision,
    invariants: invariantReceipts,
    deltaRecipients: deltaRouter.route({ operation: op, schema: session.schema, domains: session.domains }),
    syncPlan: adaptiveSync.plan({
      operation: op, schema: session.schema, domains: session.domains,
      telemetry: options.syncTelemetry || {}, coordination: decision
    })
  };
  session.pendingOperation = session.crdt.getHistory().at(-1);
  await persist(options.db, session);
  return result;
}

async function persistOfflineOperation(context, offline) {
  const { sessionId, session, options, op } = context;
  if (offline.duplicate) return { sessionId, offline: true, duplicate: true, snapshot: offline.snapshot };
  session.pendingReplicaEvent = {
    type: 'OFFLINE_OPERATION', replicaId: options.replicaId, opId: op.opId, policy: offline.policy
  };
  try {
    await persist(options.db, session);
  } catch (error) {
    offline.rollback();
    session.pendingReplicaEvent = null;
    throw error;
  }
  return {
    sessionId, offline: true, queued: offline.policy === 'QUEUE_UNTIL_CONNECTED',
    policy: offline.policy, snapshot: offline.snapshot
  };
}

async function snapshot(sessionId, options = {}) {
  const session = await getSession(sessionId, options.db);
  validateConsumerDomain(session, options.domainId);
  const shared = session.crdt.getSnapshot();
  return {
    sessionId,
    shared: projectedSnapshot(session, shared, options.domainId),
    schema: projectedSchema(session, options.domainId),
    domains: options.domainId ? { [options.domainId]: session.domains[options.domainId] } : session.domains,
    reflex: reflexSignals.snapshot(session, options.domainId),
    cytoplasm: session.cytoplasm.snapshotState(),
    consistency: assessConsistency(session)
  };
}

function validateConsumerDomain(session, domainId) {
  if (domainId && !session.domains[domainId]) {
    throw Object.assign(new Error(`Unknown Syncytium domain '${domainId}'.`), { code: 'SYNCYTIUM_DOMAIN_UNKNOWN' });
  }
}

function projectedSnapshot(session, shared, domainId) {
  const domain = domainId ? session.domains[domainId] : null;
  return domain ? projectionMaterializer.projectSnapshot({ snapshot: shared, schema: session.schema, domain }) : shared;
}

function projectedSchema(session, domainId) {
  const domain = domainId ? session.domains[domainId] : null;
  return domain ? projectionMaterializer.projectSchema(session.schema, domain) : session.schema;
}

function operationResult(context, shared, flags = {}) {
  const { sessionId, session, admission, decision, options } = context;
  return {
    sessionId,
    snapshot: projectedSnapshot(session, shared, options.domainId),
    schema: projectedSchema(session, options.domainId),
    warnings: admission.warnings,
    consistency: assessConsistency(session),
    coordination: decision,
    ...flags
  };
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

async function publishReflexSignal(sessionId, signal, options = {}) {
  const session = await getSession(sessionId, options.db);
  validateConsumerDomain(session, options.domainId);
  const result = reflexSignals.append(session, signal);
  if (result.duplicate) return result;
  session.pendingReflexSignal = result.signal;
  try {
    await persist(options.db, session);
  } catch (error) {
    session.reflexSignals = session.reflexSignals.filter((item) => item.signalId !== result.signal.signalId);
    session.pendingReflexSignal = null;
    throw error;
  }
  return { ...result, delivery: 'IMMEDIATE' };
}

const createSnapshot = (sessionId, options = {}) => sessionHistory.createSnapshot(sessionId, options);
const listSnapshots = (sessionId, options = {}) => sessionHistory.listSnapshots(sessionId, options);
const compactHistory = (sessionId, options = {}) => sessionHistory.compactHistory(sessionId, options);
const joinReplica = (sessionId, replica, options = {}) => sessionHistory.joinReplica(sessionId, replica, options);
const acknowledgeReplica = (sessionId, replicaId, request = {}) => sessionHistory.acknowledgeReplica(sessionId, replicaId, request);
const leaveReplica = (sessionId, replicaId, options = {}) => sessionHistory.leaveReplica(sessionId, replicaId, options);
const partitionReplica = (sessionId, replicaId, options = {}) => sessionHistory.partitionReplica(sessionId, replicaId, options);
const reconcileReplica = (sessionId, replicaId, request = {}) => sessionHistory.reconcileReplica(sessionId, replicaId, request);
const inspectReplicas = (sessionId, options = {}) => sessionHistory.inspectReplicas(sessionId, options);
const explain = (sessionId, request = {}) => diagnostics.explain(sessionId, request);
const simulateWithout = (sessionId, opId, options = {}) => diagnostics.simulateWithout(sessionId, opId, options);
const simulateReplacing = (sessionId, opId, request = {}) => diagnostics.simulateReplacing(sessionId, opId, request);
const localizeFaults = (sessionId, options = {}) => diagnostics.localizeFaults(sessionId, options);
const repairInvariant = (sessionId, request = {}) => diagnostics.repairInvariant(sessionId, request);
const chooseRepairCandidates = (candidates = []) => diagnostics.chooseRepairCandidates(candidates);
const createSpeculativeBranch = (sessionId, request = {}) => speculation.create(sessionId, request);
const applySpeculativeOperation = (sessionId, request = {}) => speculation.apply(sessionId, request);
const compareSpeculativeBranch = (sessionId, request = {}) => speculation.compare(sessionId, request);
const promoteSpeculativeBranch = (sessionId, request = {}) => speculation.promote(sessionId, request);
const codeVariant = createCodeVariantService({ createSession, applyOperation, snapshot });
const createCodeSession = (mission, options = {}) => codeVariant.createSession(mission, options);
const applyCodeChange = (sessionId, change, options = {}) => codeVariant.applyChange(sessionId, change, options);
const recordCodeTestResult = (sessionId, result, options = {}) => codeVariant.recordTestResult(sessionId, result, options);
const recordCodeBuildState = (sessionId, build, options = {}) => codeVariant.recordBuildState(sessionId, build, options);
const codeSnapshot = (sessionId, options = {}) => codeVariant.snapshot(sessionId, options);
const variantFacade = createVariantFacade({
  createSession, applyOperation, applyTransaction, snapshot, createSnapshot, listSnapshots,
  compactHistory, explain, localizeFaults, chooseRepairCandidates, repairInvariant,
  inspectHistory: sessionHistory.inspectHistory, inspectConflicts: diagnostics.inspectConflicts
});

async function closeSession(sessionId, options = {}) {
  const existed = sessions.delete(sessionId);
  if (options.db) await persistence.removeSession(options.db, sessionId);
  return true;
}

module.exports = {
  createSession, applyOperation, applyTransaction, publishReflexSignal,
  snapshot, createSnapshot, listSnapshots, compactHistory,
  joinReplica, acknowledgeReplica, leaveReplica, inspectReplicas,
  partitionReplica, reconcileReplica,
  explain, simulateWithout, simulateReplacing, localizeFaults,
  repairInvariant,
  chooseRepairCandidates,
  createSpeculativeBranch, applySpeculativeOperation, compareSpeculativeBranch, promoteSpeculativeBranch,
  createCodeSession, applyCodeChange, recordCodeTestResult, recordCodeBuildState, codeSnapshot,
  ...variantFacade,
  assessConsistency, closeSession, isIonicFlux, rehydrate
};
