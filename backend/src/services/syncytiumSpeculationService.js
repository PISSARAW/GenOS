'use strict';

const { createSyncytiumCrdt } = require('./syncytiumCrdtService');
const schemaService = require('./syncytiumSchemaService');
const authority = require('./syncytium/security/mutationAuthorityService');
const classifier = require('./syncytium/consistency/operationClassifier');
const zones = require('./syncytium/consistency/consistencyZoneService');
const conflicts = require('./syncytium/conflicts/semanticConflictService');
const invariantGate = require('./syncytium/invariants/invariantGate');
const router = require('./syncytium/consistency/coordinationRouter');

function createSyncytiumSpeculationService(dependencies) {
  return {
    create: (sessionId, request) => createBranch(sessionId, request, dependencies),
    apply: (sessionId, request) => applyBranch(sessionId, request, dependencies),
    compare: (sessionId, request) => compareBranch(sessionId, request, dependencies),
    promote: (sessionId, request) => promoteBranch(sessionId, request, dependencies)
  };
}

async function createBranch(sessionId, request, dependencies) {
  return router.run({ coordinationRequired: true }, sessionId, async () => {
    const session = await dependencies.getSession(sessionId, request.options?.db);
    const branchId = String(request.branchId || '').trim();
    if (!branchId) throw speculationError('SYNCYTIUM_BRANCH_INVALID', 'Speculative branch requires a branchId.');
    if (session.speculativeBranches[branchId]) throw speculationError('SYNCYTIUM_BRANCH_EXISTS', `Branch '${branchId}' already exists.`);
    const branch = {
      branchId, status: 'OPEN', baseStateVersion: session.crdt.getSnapshot().totalOps,
      baseFrontier: session.crdt.getCausalFrontier(), crdtState: session.crdt.serialize(), operations: [],
      createdAtMs: Date.now()
    };
    session.speculativeBranches[branchId] = branch;
    session.pendingReplicaEvent = { type: 'SPECULATION_CREATED', branchId };
    await persistBranchChange({ session, options: request.options || {}, dependencies, rollback: () => delete session.speculativeBranches[branchId] });
    return branch;
  });
}

async function applyBranch(sessionId, request, dependencies) {
  const { branchId, operation, options = {} } = request;
  return router.run({ coordinationRequired: true }, sessionId, async () => {
    const session = await dependencies.getSession(sessionId, options.db);
    const branch = requireOpenBranch(session, branchId);
    validateBranchBase(session, branch);
    const previous = structuredClone(branch);
    const candidate = restoreBranch(branch);
    const admitted = schemaService.admitOperation(session.schema, operation).operation;
    if (candidate.hasOpId(admitted.opId)) return { branchId, duplicate: true, snapshot: candidate.getSnapshot() };
    validateBranchOperation(session, candidate, admitted);
    candidate.applyOp(admitted);
    branch.crdtState = candidate.serialize();
    branch.operations = [...branch.operations, candidate.getHistory().at(-1)];
    session.pendingReplicaEvent = { type: 'SPECULATION_UPDATED', branchId, opId: admitted.opId };
    await persistBranchChange({ session, options, dependencies, rollback: () => Object.assign(branch, previous) });
    return { branchId, snapshot: candidate.getSnapshot(), operation: candidate.getHistory().at(-1) };
  });
}

async function compareBranch(sessionId, request, dependencies) {
  const { branchId, options = {} } = request;
  const session = await dependencies.getSession(sessionId, options.db);
  const branch = requireBranch(session, branchId);
  const simulated = restoreBranch(branch).getSnapshot();
  const current = session.crdt.getSnapshot();
  return { branchId, baseStateVersion: branch.baseStateVersion, current, simulated, changedFields: changedFields(current.sharedFields, simulated.sharedFields) };
}

async function promoteBranch(sessionId, request, dependencies) {
  const { branchId, options = {} } = request;
  return router.run({ coordinationRequired: true }, sessionId, async () => {
    const session = await dependencies.getSession(sessionId, options.db);
    const branch = requireOpenBranch(session, branchId);
    validateBranchBase(session, branch);
    const previousCrdt = session.crdt;
    const previousBranch = structuredClone(branch);
    const candidate = session.crdt.fork();
    const accepted = promoteOperations(session, candidate, branch.operations);
    session.crdt = candidate;
    branch.status = 'PROMOTED';
    branch.promotedAtMs = Date.now();
    session.pendingOperations = accepted;
    session.pendingReplicaEvent = { type: 'SPECULATION_PROMOTED', branchId, operationIds: accepted.map((item) => item.opId) };
    try {
      await dependencies.persist(options.db, session);
    } catch (error) {
      session.crdt = previousCrdt;
      Object.assign(branch, previousBranch);
      session.pendingOperations = null;
      session.pendingReplicaEvent = null;
      throw error;
    }
    return { branchId, status: branch.status, operationIds: accepted.map((item) => item.opId), snapshot: candidate.getSnapshot() };
  });
}

function promoteOperations(session, candidate, operations) {
  const accepted = [];
  for (const operation of operations) {
    if (candidate.hasOpId(operation.opId)) continue;
    const admitted = schemaService.admitOperation(session.schema, operation).operation;
    validateBranchOperation(session, candidate, admitted);
    candidate.applyOp(admitted);
    accepted.push(admitted);
  }
  return accepted;
}

function validateBranchOperation(session, candidate, operation) {
  if (typeof operation.opId !== 'string' || !operation.opId.trim()) {
    throw speculationError('SYNCYTIUM_BRANCH_OPERATION_INVALID', 'Speculative operations require an opId.');
  }
  authority.authorize(session.domains, session.schema, operation);
  const decision = classifier.classify(session.schema, operation);
  zones.validateMutation(decision.zone, operation, candidate.getSnapshot().sharedFields);
  conflicts.assertNoBlockingConflicts({
    operation, history: candidate.getHistory(), schema: session.schema, domains: session.domains
  });
  invariantGate.evaluateCandidate({ schema: session.schema, crdt: candidate, operation });
}

function validateBranchBase(session, branch) {
  const floor = session.crdt.serialize().compactedFrontier;
  const stale = Object.entries(floor).some(([actor, sequence]) => (branch.baseFrontier[actor] || 0) < sequence);
  if (stale) throw speculationError('SYNCYTIUM_BRANCH_BASE_COMPACTED', 'Speculative branch base predates the retained causal checkpoint.');
}

function restoreBranch(branch) {
  return restoreRuntime(branch.crdtState);
}

function restoreRuntime(state) {
  const candidate = createSyncytiumCrdt();
  candidate.restore(state);
  return candidate;
}

function requireOpenBranch(session, branchId) {
  const branch = requireBranch(session, branchId);
  if (branch.status !== 'OPEN') throw speculationError('SYNCYTIUM_BRANCH_CLOSED', `Branch '${branchId}' is not open.`);
  return branch;
}

function requireBranch(session, branchId) {
  const branch = session.speculativeBranches[branchId];
  if (!branch) throw speculationError('SYNCYTIUM_BRANCH_UNKNOWN', `Unknown speculative branch '${branchId}'.`);
  return branch;
}

async function persistBranchChange(context) {
  const { session, options, dependencies, rollback } = context;
  try {
    await dependencies.persist(options.db, session);
  } catch (error) {
    rollback();
    session.pendingReplicaEvent = null;
    throw error;
  }
}

function changedFields(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}

function speculationError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createSyncytiumSpeculationService };
