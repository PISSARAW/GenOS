'use strict';

const { createSyncytiumCrdt } = require('../../syncytiumCrdtService');
const hybridClock = require('../causality/hybridLogicalClockService');
const invariantGate = require('../invariants/invariantGate');
const causalClock = require('../causality/causalClockService');
const vectors = require('../causality/versionVectorService');
const operationIdentity = require('../causality/operationIdentity');

function stage(context) {
  const replica = partitionedReplica(context);
  if (!replica) return null;
  assertOfflineRequest(replica, context.operation);
  const policy = offlinePolicy(context.session.schema, context.operation);
  enforcePolicy(policy);
  const previous = structuredClone(replica);
  const local = createLocalState(replica, context.session.crdt.serialize());
  const snapshot = local.getSnapshot();
  if (isDuplicate(replica, local, context.operation.opId)) {
    assertDuplicate(replica, local, context.operation);
    return { duplicate: true, snapshot, policy };
  }
  enforceQueueLimit(replica, context.operation.offlineQueueLimit);
  enforceOfflineAuthority(replica.authority, context.operation);
  const hlc = hybridClock.tick({ previous: replica.hybridClock, remote: context.operation.hybridClock,
    wallTime: context.operation.wallTime, actorId: context.operation.actorId || replica.actorId });
  const frontier = replica.offlineOperations.reduce((value, item) =>
    vectors.merge(value, item.versionVector || {}), local.getCausalFrontier());
  const operation = causalClock.record(normalizeOfflineOperation(context.operation, policy, hlc), frontier);
  if (policy === 'ALLOW_LOCAL_MUTATION') {
    invariantGate.evaluateCandidate({ schema: context.session.schema, crdt: local, operation });
  }
  storeOfflineOperation({ replica, local, operation, policy, hlc });
  return { snapshot: local.getSnapshot(), policy, rollback: () => Object.assign(replica, previous) };
}

function partitionedReplica(context) {
  const replica = context.session.replicas[context.options.replicaId];
  if (context.options.replicaId && !replica) {
    throw offlineError('SYNCYTIUM_REPLICA_UNKNOWN', 'Mutation references an unknown replica.');
  }
  if (replica?.status === 'RETIRED') throw offlineError('SYNCYTIUM_REPLICA_UNKNOWN', 'Mutation references a retired replica.');
  return replica?.status === 'PARTITIONED' ? replica : null;
}

function assertOfflineRequest(replica, operation) {
  if (operation.actorId !== replica.actorId) {
    throw offlineError('SYNCYTIUM_REPLICA_ACTOR_MISMATCH', 'Offline mutation actor does not own the partitioned replica.');
  }
  if (Number.isSafeInteger(operation.offlineExpiresAt) && operation.offlineExpiresAt <= Date.now()) {
    throw offlineError('SYNCYTIUM_OFFLINE_OPERATION_EXPIRED', 'The offline operation exceeds its accepted offline period.');
  }
}

function enforceQueueLimit(replica, queueLimit) {
  if (queueLimit === undefined) return;
  if (!Number.isSafeInteger(queueLimit) || queueLimit < 1 || replica.offlineOperations.length >= queueLimit) {
    throw offlineError('SYNCYTIUM_OFFLINE_QUEUE_FULL', 'Replica offline operation queue is full.');
  }
}

function assertDuplicate(replica, local, operation) {
  if (local.assertDuplicateOperation(operation)) return;
  const existing = replica.offlineOperations.find((item) => item.opId === operation.opId);
  operationIdentity.assertSame(operationIdentity.digest(existing), operation);
}

function storeOfflineOperation(context) {
  const { replica, local, operation, policy, hlc } = context;
  if (policy === 'ALLOW_LOCAL_MUTATION') {
    local.applyOp(operation);
    replica.offlineCrdtState = local.serialize();
    replica.offlineOperations = [...(replica.offlineOperations || []), local.getHistory().at(-1)];
  } else replica.offlineOperations = [...(replica.offlineOperations || []), structuredClone(operation)];
  replica.hybridClock = hlc;
  if (replica.authority) replica.authority.spentOperations += 1;
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
  if (field?.offlinePolicy === 'REJECT' || field?.offlinePolicy === 'ALLOW_READ_ONLY') return field.offlinePolicy;
  const requestedPolicy = operation.offlinePolicy;
  if (requestedPolicy !== undefined) {
    const supported = new Set(['ALLOW_LOCAL_MUTATION', 'ALLOW_READ_ONLY', 'QUEUE_UNTIL_CONNECTED', 'REJECT']);
    if (!supported.has(requestedPolicy)) throw offlineError('SYNCYTIUM_OFFLINE_POLICY_INVALID', 'Unsupported offline mutation policy.');
    if (field?.offlinePolicy === 'QUEUE_UNTIL_CONNECTED' && requestedPolicy === 'ALLOW_LOCAL_MUTATION') {
      throw offlineError('SYNCYTIUM_OFFLINE_POLICY_INVALID', 'A queued-only field cannot be mutated locally.');
    }
    return requestedPolicy;
  }
  return field?.offlinePolicy || 'ALLOW_LOCAL_MUTATION';
}

function offlineError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { stage };
