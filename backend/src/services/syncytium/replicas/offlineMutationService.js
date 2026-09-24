'use strict';

const { createSyncytiumCrdt } = require('../../syncytiumCrdtService');

function stage(context) {
  const replica = context.session.replicas[context.options.replicaId];
  if (!replica || replica.status !== 'PARTITIONED') return null;
  const policy = offlinePolicy(context.session.schema, context.operation);
  enforcePolicy(policy);
  const previous = structuredClone(replica);
  const local = createLocalState(replica, context.session.crdt.serialize());
  const snapshot = local.getSnapshot();
  if (isDuplicate(replica, local, context.operation.opId)) return { duplicate: true, snapshot, policy };
  const operation = normalizeOfflineOperation(context.operation, policy);
  storeOfflineOperation({ replica, local, operation, policy });
  return { snapshot: local.getSnapshot(), policy, rollback: () => Object.assign(replica, previous) };
}

function storeOfflineOperation(context) {
  const { replica, local, operation, policy } = context;
  if (policy === 'ALLOW_LOCAL_MUTATION') {
    local.applyOp(operation);
    replica.offlineCrdtState = local.serialize();
    replica.offlineOperations = [...(replica.offlineOperations || []), local.getHistory().at(-1)];
  } else replica.offlineOperations = [...(replica.offlineOperations || []), operation];
}

function isDuplicate(replica, local, opId) {
  return local.hasOpId(opId) || (replica.offlineOperations || []).some((item) => item.opId === opId);
}

function normalizeOfflineOperation(operation, policy) {
  return policy === 'QUEUE_UNTIL_CONNECTED' ? { ...operation, queuedUntilConnected: true } : operation;
}

function enforcePolicy(policy) {
  if (policy !== 'REJECT' && policy !== 'ALLOW_READ_ONLY') return;
  const code = policy === 'REJECT' ? 'SYNCYTIUM_OFFLINE_REJECTED' : 'SYNCYTIUM_OFFLINE_READ_ONLY';
  throw offlineError(code, `Offline policy '${policy}' rejects mutations.`);
}

function createLocalState(replica, baseState) {
  const local = createSyncytiumCrdt();
  local.restore(replica.offlineCrdtState || baseState);
  return local;
}

function offlinePolicy(schema, operation) {
  const field = schema?.fields?.[operation.kind?.key];
  if (operation.fieldType === 'ESCROW_COUNTER') return 'REJECT';
  return field?.offlinePolicy || 'ALLOW_LOCAL_MUTATION';
}

function offlineError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { stage };
