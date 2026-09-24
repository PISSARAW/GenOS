'use strict';

const { randomUUID } = require('node:crypto');

const ROLE_CATALOG = Object.freeze({
  shared_state_coordinator: { plane: 'State Plane', handles: ['create_session', 'snapshot', 'apply_operation', 'apply_transaction'] },
  parallel_executor: { plane: 'Execution Nuclei', handles: ['execute_operation'], multiplicity: 'N' },
  consistency_guardian: { plane: 'Invariant/Security Plane', handles: ['audit', 'explain', 'localize_faults', 'repair'] },
  integration_executor: { plane: 'Materialization Plane', handles: ['materialize', 'list_snapshots'] }
});

function createRoleServiceDirectory(syncytium) {
  return {
    catalog: ROLE_CATALOG,
    statePlane: createStatePlane(syncytium),
    consistencyGuardian: createConsistencyGuardian(syncytium),
    integrationExecutor: createIntegrationExecutor(syncytium),
    createExecutionNucleus: (identity) => createExecutionNucleus(identity, syncytium)
  };
}

function createStatePlane(syncytium) {
  return {
    createSession: (mission, options) => syncytium.createSession(mission, options || {}),
    snapshot: (sessionId, options) => syncytium.snapshot(sessionId, options || {}),
    applyOperation: (sessionId, operation, options) => syncytium.applyOperation(sessionId, operation, options || {}),
    applyTransaction: (sessionId, transaction, options) => syncytium.applyTransaction(sessionId, transaction, options || {})
  };
}

function createExecutionNucleus(identity = {}, syncytium) {
  const actorId = String(identity.actorId || '').trim();
  const nucleusId = String(identity.nucleusId || '').trim();
  if (!actorId || !nucleusId) throw serviceError('Execution nucleus requires actorId and nucleusId.');
  return {
    role: 'parallel_executor', actorId, nucleusId,
    execute: (sessionId, operation, options) => execute({ sessionId, operation, options, actorId, nucleusId, syncytium })
  };
}

async function execute(context) {
  if (!context.operation?.kind || typeof context.operation.kind !== 'object') {
    throw serviceError('Execution nucleus requires an operation kind.');
  }
  const operation = {
    ...context.operation,
    opId: context.operation.opId || randomUUID(),
    actorId: context.actorId,
    domainId: context.nucleusId
  };
  return context.syncytium.applyOperation(context.sessionId, operation, {
    ...(context.options || {}), domainId: context.nucleusId
  });
}

function createConsistencyGuardian(syncytium) {
  return {
    audit: async (sessionId, options) => (await syncytium.snapshot(sessionId, options || {})).consistency,
    explain: (sessionId, request) => syncytium.explain(sessionId, request || {}),
    localizeFaults: (sessionId, options) => syncytium.localizeFaults(sessionId, options || {}),
    chooseRepairs: (candidates) => syncytium.chooseRepairCandidates(candidates || []),
    repair: (sessionId, request) => syncytium.repairInvariant(sessionId, request || {})
  };
}

function createIntegrationExecutor(syncytium) {
  return {
    materialize: async (sessionId, options = {}) => {
      const stored = await syncytium.createSnapshot(sessionId, options);
      const snapshot = await syncytium.snapshot(sessionId, options);
      return { stored, snapshot };
    },
    listSnapshots: (sessionId, options) => syncytium.listSnapshots(sessionId, options || {})
  };
}

function serviceError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_ROLE_SERVICE_INVALID' });
}

module.exports = { ROLE_CATALOG, createRoleServiceDirectory };
