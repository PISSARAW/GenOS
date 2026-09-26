'use strict';
const S = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');
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
      logicalClock: { dataType: 'MV_REGISTER', consistencyZone: 'CAUSAL' },
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
  return syn.createSession(m, { ...o, schema, variantPolicy: { id: 'localFirst' } });
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
  return syn.applyOperation(sid, {
    opId, actorId: defaultActor(o, 'hlc-writer'),
    kind: { type: 'typed_field', key: 'logicalClock', action: 'set',
      entryKey: dev, value: { deviceId: dev, logicalTime: ts, wallClock: n, recordedAt: n } }
  }, o);
}

async function syncFromPeer(context) {
  const { sid, src, dst, vc, o, syn } = context;
  assertDevId(src, 'sourceDeviceId');
  assertDevId(dst, 'targetDeviceId');
  assertVecClock(vc);
  const opId = defaultOpId(o);
  return syn.applyOperation(sid, {
    opId, actorId: defaultActor(o, 'peer-sync'),
    kind: { type: 'typed_field', key: 'syncState', action: 'set',
      entryKey: `${src}→${dst}`,
      value: { sourceDeviceId: src, targetDeviceId: dst,
        remoteVectorClock: Object.assign({}, vc), syncedAt: now(),
        bytesTransferred: (o&&o.bytesTransferred)||0, outcome: 'SYNCED' } }
  }, o);
}

async function partitionAndWorkOffline(context) {
  const { sid, dev, ops, o, syn } = context;
  assertDevId(dev, 'deviceId');
  if (!Array.isArray(ops) || ops.length === 0)
    throw new Error('LocalFirstError: operations must be a non-empty array');
  const n = now(), expiresAt = n + ((o&&o.offlineDurationMs)||MAX_OFFLINE);
  if (expiresAt - n > MAX_OFFLINE)
    throw new Error('LocalFirstError: offlineDurationMs exceeds maximum allowed (7 days)');
  const entries = ops.map((op, idx) => ({
    operationId: op.operationId || `${dev}-${n}-${idx}`,
    deviceId: dev, payload: op.payload,
    operationType: op.operationType || 'mutation',
    createdAt: n, expiresAt, sequence: idx
  }));
  return syn.applyOperation(sid, {
    opId: defaultOpId(o), actorId: defaultActor(o, 'offline-worker'),
    kind: { type: 'typed_field', key: 'offlineQueue', action: 'add', value: entries }
  }, o);
}

async function reconcileOfflineQueue(context) {
  const { sid, dev, vc, o, syn } = context;
  assertDevId(dev, 'deviceId');
  assertVecClock(vc);
  const snap = await syn.snapshot(sid, o);
  const queue = snap.shared?.sharedFields?.offlineQueue || [];
  const pending = queue.filter(e => e.deviceId === dev && !e.reconciled);
  if (pending.length === 0) return { reconciled: 0, deviceId: dev, timestamp: now() };
  const reconciledAt = now();
  const record = { deviceId: dev, reconciledAt, operationCount: pending.length,
    remoteVectorClock: Object.assign({}, vc), status: 'RECONCILED' };
  await syn.applyOperation(sid, {
    opId: defaultOpId(o), actorId: defaultActor(o, 'reconciler'),
    kind: { type: 'typed_field', key: 'syncState', action: 'set',
      entryKey: `reconciliation-${dev}-${reconciledAt}`, value: record }
  }, o);
  return { reconciled: pending.length, deviceId: dev, timestamp: reconciledAt, record };
}

async function checkBudget(context) {
  const { sid, dev, o, syn } = context;
  assertDevId(dev, 'deviceId');
  const snap = await syn.snapshot(sid, o);
  const queue = snap.shared?.sharedFields?.offlineQueue || [];
  const deviceReplicas = snap.shared?.sharedFields?.deviceReplicas || {};
  const deviceOps = queue.filter(e => e.deviceId === dev);
  const replicaInfo = deviceReplicas[dev] || {};
  return {
    deviceId: dev,
    pendingOperations: deviceOps.filter(e => !e.reconciled).length,
    totalOperations: deviceOps.length,
    ageMs: now() - (replicaInfo.lastSyncAt || 0),
    ageSeconds: Math.round((now() - (replicaInfo.lastSyncAt || 0)) / 1000),
    lastSyncAt: replicaInfo.lastSyncAt || 0,
    canAcceptMore: deviceOps.filter(e => !e.reconciled).length < 10000,
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
  const syncHistory = Object.values(ss).filter(s => s.outcome !== undefined);

  return {
    sessionId: sid, schemaId: 'syncytium-local-first-v1',
    devices: Object.keys(lc).length,
    devicesList: mapLogicalClockEntries(lc),
    offlineQueue: buildOfflineQueueSummary(oq),
    syncHistory: buildSyncHistorySummary(syncHistory),
    deviceReplicas: buildDeviceReplicasSummary(dr),
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
