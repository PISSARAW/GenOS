'use strict';

const { createSyncytiumCrdt } = require('../../syncytiumCrdtService');
const hybridClock = require('../causality/hybridLogicalClockService');

function stage(context) {
  const replica = context.session.replicas[context.options.replicaId];
  if (!replica || replica.status !== 'PARTITIONED') return null;
  const policy = offlinePolicy(context.session.schema, context.operation);
  enforcePolicy(policy);
  const previous = structuredClone(replica);
  const local = createLocalState(replica, context.session.crdt.serialize());
  const snapshot = local.getSnapshot();
  if (isDuplicate(replica, local, context.operation.opId)) return { duplicate: true, snapshot, policy };
  enforceOfflineAuthority(replica.authority, context.operation);
  const hlc = hybridClock.tick({ previous: replica.hybridClock, remote: context.operation.hybridClock,
    wallTime: context.operation.wallTime, actorId: context.operation.actorId || replica.actorId });
  const operation = normalizeOfflineOperation(context.operation, policy, hlc);
  storeOfflineOperation({ replica, local, operation, policy, hlc });
  return { snapshot: local.getSnapshot(), policy, rollback: () => Object.assign(replica, previous) };
}

function storeOfflineOperation(context) {
  const { replica, local, operation, policy, hlc } = context;
  replica.hybridClock = hlc;
  if (replica.authority) replica.authority.spentOperations += 1;
  if (policy === 'ALLOW_LOCAL_MUTATION') {
    local.applyOp(operation);
    replica.offlineCrdtState = local.serialize();
    replica.offlineOperations = [...(replica.offlineOperations || []), local.getHistory().at(-1)];
  } else replica.offlineOperations = [...(replica.offlineOperations || []), operation];
}

function enforceOfflineAuthority(authority, operation) {
  if (!authority) return;
  if (authority.validUntilMs !== undefined && authority.validUntilMs <= Date.now()) {
    throw offlineError('SYNCYTIUM_OFFLINE_AUTHORITY_EXPIRED', 'Offline authority has expired.');
  }
  const field = operation.kind?.key;
  if (authority.allowedFields && !authority.allowedFields.includes(field)) {
    throw offlineError('SYNCYTIUM_OFFLINE_FIELD_FORBIDDEN', 'Offline authority does not allow this field.');
  }
  if (authority.maxOperations !== undefined && authority.spentOperations >= authority.maxOperations) {
    throw offlineError('SYNCYTIUM_OFFLINE_BUDGET_EXHAUSTED', 'Offline operation budget is exhausted.');
  }
}

function isDuplicate(replica, local, opId) {
  return local.hasOpId(opId) || (replica.offlineOperations || []).some((item) => item.opId === opId);
}

function normalizeOfflineOperation(operation, policy, hlc) {
  return { ...operation, hybridClock: hlc, ...(policy === 'QUEUE_UNTIL_CONNECTED' ? { queuedUntilConnected: true } : {}) };
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
