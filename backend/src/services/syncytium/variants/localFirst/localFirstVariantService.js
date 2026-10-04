'use strict';
const S = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');
const hybridClock = require('../../causality/hybridLogicalClockService');
const MAX_OFFLINE = 7*24*60*60*1000;

function createLocalFirstVariantService(syn) {
  return {
    createLocalFirstSession: (m, o) => createSession(m, o, syn),
    recordHybridClock: (ctx) => applyHLC({ ...ctx, syn }),
    syncPeer: (ctx) => syncFromPeer({ ...ctx, syn }),
    partitionOffline: (ctx) => partitionAndWorkOffline({ ...ctx, syn }),
    reconcileQueue: (ctx) => reconcileOfflineQueue({ ...ctx, syn }),
    checkOfflineBudget: (ctx) => checkBudget({ ...ctx, syn }),
    listReplicas: (ctx) => listDeviceReplicas({ ...ctx, syn }),
    localFirstSnapshot: (ctx) => localFirstSnapshot({ ...ctx, syn })
  };
}

function compileSchema(opt) {
  return S.compile({
    schemaId: 'syncytium-local-first-v1',
    fields: {
      logicalClock: { dataType: 'MAP', consistencyZone: 'CAUSAL' },
      physicalClockOffset: { dataType: 'LWW_REGISTER', consistencyZone: 'CAUSAL' },
      offlineQueue: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      syncState: { dataType: 'MAP', consistencyZone: 'CAUSAL' },
      deviceReplicas: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' },
      encryptedLocalStoreKey: { dataType: 'LWW_REGISTER', consistencyZone: 'SERIALIZABLE' },
      ...((opt&&opt.customFields)||{})
    }
  });
}

function createSession(m, o, syn) {
  const schema = compileSchema(o);
  if (o && o.fields && Object.keys(o.fields).length > 0)
    schema.fields = Object.assign({}, schema.fields, o.fields);
  return syn.createSession(m, { ...o, schema, variantPolicy: o.variantPolicy || { id: 'localFirst' } });
}

function assertDevId(id, label) {
  if (!id || typeof id !== 'string')
    throw new Error(`LocalFirstError: ${label} must be a non-empty string`);
}
function assertNonNegFinite(v, label) {
  if (typeof v !== 'number' || v < 0 || !isFinite(v))
    throw new Error(`LocalFirstError: ${label} must be a non-negative finite number`);
}
function assertVecClock(vc) {
  if (!vc || typeof vc !== 'object' || Array.isArray(vc))
    throw new Error('LocalFirstError: remoteVectorClock must be a non-null object');
}
function now() { return Date.now(); }
function defaultOpId(o) { return o && o.opId || randomUUID(); }
function defaultActor(o, fallback) { return (o && o.actorId) || fallback; }

async function applyHLC(context) {
  const { sid, dev, ts, o, syn } = context;
  assertDevId(dev, 'deviceId');
  assertNonNegFinite(ts, 'logicalTime');
  const n = now(), opId = defaultOpId(o);
  const snapshot = await syn.snapshot(sid, o || {});
  const previous = snapshot.shared?.sharedFields?.logicalClock?.[dev];
  const value = hybridClock.tick({ previous, wallTime: ts, actorId: defaultActor(o, dev) });
  return syn.applyOperation(sid, {
    opId, actorId: defaultActor(o, 'hlc-writer'),
    kind: { type: 'typed_field', key: 'logicalClock', action: 'set',
      entryKey: dev, value: { deviceId: dev, logicalTime: value.logical, wallClock: value.wallTime, actorId: value.actorId, recordedAt: n } }
  }, o);
}

async function syncFromPeer(context) {
  const { sid, src, dst, vc, o, syn } = context;
  assertDevId(src, 'sourceDeviceId');
  assertDevId(dst, 'targetDeviceId');
  assertVecClock(vc);
  const syncedAt = now(), opId = defaultOpId(o), actorId = defaultActor(o, 'peer-sync');
  return syn.applyTransaction(sid, { txId: opId, operations: [
    { opId, actorId, kind: { type: 'typed_field', key: 'syncState', action: 'set',
      entryKey: `${src}→${dst}`,
      value: { sourceDeviceId: src, targetDeviceId: dst,
        remoteVectorClock: Object.assign({}, vc), syncedAt,
        bytesTransferred: (o&&o.bytesTransferred)||0, outcome: 'SYNCED' } } },
    { opId: `${opId}:replica`, actorId, kind: { type: 'typed_field', key: 'deviceReplicas', action: 'set',
      entryKey: dst, value: { deviceId: dst, lastSyncAt: syncedAt, operationCount: 0 } } }
  ] }, o);
}

async function partitionAndWorkOffline(context) {
  const { sid, dev, ops, o, syn } = context;
  assertDevId(dev, 'deviceId');
  if (!Array.isArray(ops) || ops.length === 0)
    throw new Error('LocalFirstError: operations must be a non-empty array');
  const n = now(), duration = o?.offlineDurationMs === undefined ? MAX_OFFLINE : o.offlineDurationMs;
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > MAX_OFFLINE)
    throw new Error('LocalFirstError: offlineDurationMs exceeds maximum allowed (7 days)');
  const expiresAt = n + duration;
  const actorId = defaultActor(o, dev);
  const existing = (await syn.inspectReplicas(sid, o || {})).find((replica) => replica.replicaId === dev);
  if ((existing?.offlineOperationCount || 0) + ops.length > 10000) {
    throw Object.assign(new Error('Offline operation queue budget is exhausted.'), { code: 'SYNCYTIUM_OFFLINE_QUEUE_FULL' });
  }
  await syn.joinReplica(sid, { replicaId: dev, actorId }, o || {});
  await syn.applyOperation(sid, { opId: randomUUID(), actorId,
    kind: { type: 'typed_field', key: 'deviceReplicas', action: 'set', entryKey: dev,
      value: { deviceId: dev, lastSyncAt: n, operationCount: 0 } } }, o || {});
  await syn.partitionReplica(sid, dev, o || {});
  const entries = ops.map((op, idx) => ({
    operationId: op.operationId || `${dev}-${n}-${idx}`,
    deviceId: dev, payload: op.payload,
    operationType: op.operationType || 'mutation',
    createdAt: n, expiresAt, sequence: idx
  }));
  const staged = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const requested = ops[index].operation;
    const operation = requested && typeof requested === 'object' ? requested : {
      kind: { type: 'typed_field', key: 'offlineQueue', action: 'add', value: entry }
    };
    staged.push(await syn.applyOperation(sid, {
      ...operation, opId: entry.operationId, actorId,
      offlinePolicy: 'ALLOW_LOCAL_MUTATION', offlineQueueLimit: 10000, offlineExpiresAt: expiresAt
    }, { ...(o || {}), replicaId: dev }));
  }
  return { deviceId: dev, offline: true, staged: staged.length, entries,
    operationIds: entries.map((entry) => entry.operationId), localOnly: true };
}

async function reconcileOfflineQueue(context) {
  const { sid, dev, vc, o, syn } = context;
  assertDevId(dev, 'deviceId');
  assertVecClock(vc);
  const result = await syn.reconcileReplica(sid, dev, { frontier: vc, options: o || {} });
  const pendingCount = result.accepted.length + (result.expired || []).length;
  const reconciledAt = now();
  if (pendingCount === 0) {
    await recordDeviceSync({ sid, dev, syncedAt: reconciledAt, o, syn });
    return { reconciled: 0, deviceId: dev, timestamp: reconciledAt, status: result.status };
  }
  const record = { deviceId: dev, reconciledAt, operationCount: result.accepted.length,
    acceptedOperationIds: result.accepted, expiredOperationIds: result.expired || [],
    remoteVectorClock: Object.assign({}, vc), status: 'RECONCILED' };
  await syn.applyOperation(sid, {
    opId: defaultOpId(o), actorId: defaultActor(o, 'reconciler'),
    kind: { type: 'typed_field', key: 'syncState', action: 'set',
      entryKey: `reconciliation-${dev}-${reconciledAt}`, value: record }
  }, o);
  await recordDeviceSync({ sid, dev, syncedAt: reconciledAt, o, syn });
  return { reconciled: result.accepted.length, expired: result.expired || [], deviceId: dev,
    timestamp: reconciledAt, record };
}

async function recordDeviceSync(context) {
  const { sid, dev, syncedAt, o, syn } = context;
  const opId = defaultOpId(o);
  return syn.applyOperation(sid, { opId, actorId: defaultActor(o, 'peer-sync'),
    kind: { type: 'typed_field', key: 'deviceReplicas', action: 'set', entryKey: dev,
      value: { deviceId: dev, lastSyncAt: syncedAt, operationCount: 0 } } }, o);
}

async function checkBudget(context) {
  const { sid, dev, o, syn } = context;
  assertDevId(dev, 'deviceId');
  const snap = await syn.snapshot(sid, o);
  const replicas = await syn.inspectReplicas(sid, o || {});
  const replicaInfo = replicas.find((replica) => replica.replicaId === dev) || {};
  const deviceOps = replicaInfo.offlineOperationCount || 0;
  const lastSyncAt = snap.shared?.sharedFields?.deviceReplicas?.[dev]?.lastSyncAt || 0;
  return {
    deviceId: dev,
    pendingOperations: deviceOps,
    totalOperations: deviceOps + Object.values(snap.shared?.sharedFields?.syncState || {})
      .filter((item) => item.deviceId === dev).reduce((total, item) => total + (item.operationCount || 0), 0),
    ageMs: now() - lastSyncAt,
    ageSeconds: Math.round((now() - lastSyncAt) / 1000),
    lastSyncAt,
    canAcceptMore: deviceOps < 10000,
    timestamp: now()
  };
}

async function listDeviceReplicas(context) {
  const { sid, o, syn } = context;
  const snap = await syn.snapshot(sid, o);
  const replicas = snap.shared?.sharedFields?.deviceReplicas || {};
  const list = Object.entries(replicas).map(([id, info]) => ({
    deviceId: id, lastSyncAt: info.lastSyncAt || 0,
    operationCount: info.operationCount || 0,
    isActive: (now() - (info.lastSyncAt || 0)) < 300000
  }));
  return { replicas: list, totalDevices: list.length,
    activeDevices: list.filter(r => r.isActive).length, timestamp: now() };
}

async function localFirstSnapshot(context) {
  const { sid, o, syn } = context;
  const snap = await syn.snapshot(sid, o);
  const sf = snap.shared?.sharedFields || {};
  const lc = sf.logicalClock || {};
  const oq = sf.offlineQueue || [];
  const ss = sf.syncState || {};
  const dr = sf.deviceReplicas || {};
  const replicaHealth = await syn.inspectReplicas(sid, o || {});
  const syncHistory = Object.values(ss).filter(s => s.outcome !== undefined);

  return {
    sessionId: sid, schemaId: 'syncytium-local-first-v1',
    devices: new Set([...Object.keys(lc), ...replicaHealth.map((replica) => replica.replicaId)]).size,
    devicesList: mapLogicalClockEntries(lc),
    offlineQueue: buildOfflineQueueSummary(oq),
    syncHistory: buildSyncHistorySummary(syncHistory),
    deviceReplicas: buildDeviceReplicasSummary(dr),
    localReplicaState: replicaHealth.map((replica) => ({ deviceId: replica.replicaId,
      status: replica.status, pendingOperations: replica.offlineOperationCount,
      lastSeenVersion: replica.lastSeenVersion, hybridClock: replica.hybridClock })),
    encryptedLocalStoreKey: sf.encryptedLocalStoreKey ? 'SET' : 'UNSET',
    timestamp: now()
  };
}

function mapLogicalClockEntries(lc) {
  return Object.entries(lc).map(([id, entry]) => ({
    deviceId: id, logicalTime: entry.logicalTime,
    wallClock: entry.wallClock, recordedAt: entry.recordedAt
  }));
}

function buildOfflineQueueSummary(oq) {
  return {
    totalEntries: oq.length,
    byDevice: oq.reduce((acc, e) => {
      if (!acc[e.deviceId]) acc[e.deviceId] = [];
      acc[e.deviceId].push(e);
      return acc;
    }, {}),
    expiredEntries: oq.filter(e => (e.expiresAt || 0) < now()).length
  };
}

function buildSyncHistorySummary(syncHistory) {
  return {
    totalSyncs: syncHistory.length,
    lastSync: syncHistory.length > 0
      ? syncHistory.reduce((a, b) => a.syncedAt > b.syncedAt ? a : b)
      : null
  };
}

function buildDeviceReplicasSummary(dr) {
  return {
    totalDevices: Object.keys(dr).length,
    replicas: Object.entries(dr).map(([id, info]) => ({ deviceId: id, ...info }))
  };
}

module.exports = { createLocalFirstVariantService };
