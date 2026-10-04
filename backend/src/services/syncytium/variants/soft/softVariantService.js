'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');
const partitionService = require('./softPartitionService');

const PARTITION_POLICIES = new Set([
  'ALLOW_LOCAL_MUTATION',
  'ALLOW_READ_ONLY',
  'QUEUE_OPERATION',
  'REJECT_OPERATION'
]);

const DEFAULT_STALENESS_BUDGET = 5000;

function createSoftVariantService(syncytium) {
  return {
    createSoftSession: (mission, options) =>
      createSession(mission, options, syncytium),

    applyDelta: (ctx) => applyDelta({ ...ctx, syncytium }),

    reconcileAntiEntropy: (ctx) => reconcileAntiEntropy({ ...ctx, syncytium }),

    compressState: (ctx) => compressState({ ...ctx, syncytium }),

    setStalenessBudget: (ctx) => setStalenessBudget({ ...ctx, syncytium }),

    getStalenessBudget: (ctx) => getStalenessBudget({ ...ctx, syncytium }),

    simulatePartition: (ctx) => simulatePartition({ ...ctx, syncytium }),

    listDeltas: (ctx) => listDeltas({ ...ctx, syncytium }),

    softSnapshot: (ctx) => softSnapshot({ ...ctx, syncytium })
  };
}

/* ------------------------------------------------------------------ */
/* Schema                                                               */
/* ------------------------------------------------------------------ */

function compileSchema(options = {}) {
  return schemaService.compile({
    schemaId: 'syncytium-soft-v1',
    fields: {
      metrics:     { dataType: 'G_COUNTER',    consistencyZone: 'EVENTUAL' },
      deltas:      { dataType: 'ADD_WINS_SET', consistencyZone: 'EVENTUAL' },
      localDeltas: { dataType: 'ADD_WINS_SET', consistencyZone: 'EVENTUAL' },
      queuedDeltas: { dataType: 'ADD_WINS_SET', consistencyZone: 'EVENTUAL' },
      partitions: { dataType: 'MAP', consistencyZone: 'CAUSAL' },
      antiEntropyLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      stalenessBudget: { dataType: 'MV_REGISTER', consistencyZone: 'CAUSAL' },
      ...options.customFields || {}
    }
  });
}

/* ------------------------------------------------------------------ */
/* Session creation                                                     */
/* ------------------------------------------------------------------ */

function createSession(mission, options = {}, syncytium) {
  const schema = compileSchema(options);
  const fields = options.fields || {};
  // Merge any caller-supplied field overrides into a fresh compile
  if (Object.keys(fields).length > 0) {
    const merged = Object.assign({}, schema.fields, fields);
    schema.fields = merged;
  }
  return syncytium.createSession(mission, {
    ...options,
    schema,
    variantPolicy: { id: 'soft' }
  });
}

/* ------------------------------------------------------------------ */
/* Delta application (Δ-CRDT core)                                     */
/* ------------------------------------------------------------------ */

async function applyDelta(context) {
  const { sessionId, delta, options, syncytium } = context;
  validateDelta(delta);
  const actorId = options.actorId || delta.author || 'soft-writer';
  const opId = options.opId || randomUUID();
  const enriched = Object.assign({
    deltaId: delta.deltaId || randomUUID(),
    operationId: opId,
    timestamp: Date.now(),
    author: delta.author || 'anonymous',
    vectorClock: delta.vectorClock || {}
  }, delta);

  const snapshot = await syncytium.snapshot(sessionId, options);
  const replicaId = options.replicaId || actorId;
  const partition = snapshot.shared.sharedFields.partitions?.[replicaId];
  if (partition && partition.expiresAt <= Date.now()) {
    throw Object.assign(new Error('Expired partitions must reconcile before accepting more deltas.'), { code: 'SYNCYTIUM_PARTITION_RECONCILIATION_REQUIRED' });
  }
  const offlinePolicy = partition ? partitionService.nativeOfflinePolicy(partition.policy) : undefined;

  const result = await syncytium.applyOperation(sessionId, {
    opId,
    actorId,
    ...(offlinePolicy ? { offlinePolicy } : {}),
    kind: {
      type: 'typed_field',
      key: 'deltas',
      action: 'add',
      value: enriched
    }
  }, options);
  return { ...result, localOnly: result.offline && offlinePolicy === 'ALLOW_LOCAL_MUTATION',
    queued: result.queued === true, delta: enriched };
}

function validateDelta(delta) {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) {
    throw new Error('SoftVariantError: delta must be a non-null object');
  }
  if (delta.type === undefined) {
    throw new Error('SoftVariantError: delta must declare a type');
  }
}

/* ------------------------------------------------------------------ */
/* Anti-entropy reconciliation                                          */
/* ------------------------------------------------------------------ */

async function reconcileAntiEntropy(context) {
  const { sessionId, options, syncytium, vectorClock = {} } = context;
  if (options.replicaId) return partitionService.reconcileReplica(context, vectorClock);
  const snapshot = await syncytium.snapshot(sessionId, options);
  const fields = snapshot.shared?.sharedFields || {};
  const deltas = partitionService.uniqueDeltas([...fields.deltas || [], ...fields.localDeltas || [], ...fields.queuedDeltas || []]);
  const antiEntropyLog = fields.antiEntropyLog || [];

  const seenIds = new Set(antiEntropyLog.map(entry => entry.deltaId));
  const unseen = deltas.filter(d => !seenIds.has(d.deltaId));

  const reconciliationTime = Date.now();
  const entries = unseen.map(delta => ({
    deltaId: delta.deltaId,
    reconciledAt: reconciliationTime,
    author: delta.author,
    vectorClock: delta.vectorClock,
    metadata: { reconciledBy: 'anti_entropy' }
  }));

  if (entries.length === 0) {
    return { reconciled: 0, timestamp: reconciliationTime, stale: true };
  }

  const operations = unseen.flatMap((delta, index) => [
    { opId: `${options.opId || randomUUID()}:delta:${index}`, actorId: 'anti-entropy-daemon',
      kind: { type: 'typed_field', key: 'deltas', action: 'add', value: delta } },
    { opId: `${options.opId || randomUUID()}:log:${index}`, actorId: 'anti-entropy-daemon',
      kind: { type: 'typed_field', key: 'antiEntropyLog', action: 'add', value: entries[index] } }
  ]);
  await syncytium.applyTransaction(sessionId, {
    txId: options.txId || randomUUID(), operations,
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, options);

  return {
    reconciled: entries.length,
    timestamp: reconciliationTime,
    stale: false,
    deltaIds: entries.map(e => e.deltaId)
  };
}

/* ------------------------------------------------------------------ */
/* State compression                                                    */
/* ------------------------------------------------------------------ */

async function compressState(context) {
  const { sessionId, options, syncytium } = context;
  const snapshot = await syncytium.snapshot(sessionId, options);
  const fields = snapshot.shared?.sharedFields || {};
  const deltas = uniqueDeltas([...fields.deltas || [], ...fields.localDeltas || [], ...fields.queuedDeltas || []]);
  const antiEntropyLog = fields.antiEntropyLog || [];

  const coveredIds = new Set(antiEntropyLog.map(e => e.deltaId));
  const toKeep = deltas.filter(d => !coveredIds.has(d.deltaId));
  const compressedCount = deltas.length - toKeep.length;

  const metrics = deltas.reduce((acc, d) => {
    if (d.type === 'increment') acc.incrementCount = (acc.incrementCount || 0) + 1;
    if (d.type === 'set')      acc.setCount = (acc.setCount || 0) + 1;
    if (d.value !== undefined) acc.lastValue = d.value;
    return acc;
  }, { incrementCount: 0, setCount: 0, lastValue: undefined });

  return {
    compressedCount,
    remainingDeltas: toKeep.length,
    metrics,
    compressedAt: Date.now(),
    note: 'compression is read-only in this variant; compacted state write pending'
  };
}

/* ------------------------------------------------------------------ */
/* Staleness budget                                                     */
/* ------------------------------------------------------------------ */

async function setStalenessBudget(context) {
  const { sessionId, budget, options, syncytium } = context;
  if (typeof budget !== 'number' || budget < 0 || !isFinite(budget)) {
    throw new Error('SoftVariantError: stalenessBudget must be a non-negative finite number');
  }
  const opId = options.opId || randomUUID();
  return syncytium.applyOperation(sessionId, {
    opId,
    actorId: options.actorId || 'soft-admin',
    kind: {
      type: 'typed_field',
      key: 'stalenessBudget',
      action: 'assign',
      value: {
        value: budget,
        updatedAt: Date.now(),
        author: options.actorId || 'soft-admin'
      }
    }
  }, options);
}

async function getStalenessBudget(context) {
  const { sessionId, options, syncytium } = context;
  const snapshot = await syncytium.snapshot(sessionId, options);
  const budgetField = snapshot.shared?.sharedFields?.stalenessBudget;
  const current = latestBudgetValue(budgetField);
  if (!current) {
    return { budget: DEFAULT_STALENESS_BUDGET, active: false };
  }
  return { budget: current.value, active: true, updatedAt: current.updatedAt };
}

function latestBudgetValue(field) {
  const values = Array.isArray(field) ? field : field ? [field] : [];
  return values.filter((entry) => Number.isFinite(entry?.value) && Number.isSafeInteger(entry?.updatedAt))
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.author).localeCompare(String(right.author)))[0] || null;
}

/* ------------------------------------------------------------------ */
/* Partition simulation                                                 */
/* ------------------------------------------------------------------ */

async function simulatePartition(context) {
  const { sessionId, policy, durationMs, options, syncytium } = context;
  if (!PARTITION_POLICIES.has(policy)) {
    throw new Error(
      `SoftVariantError: unknown partition policy '${policy}'. ` +
      `Allowed: ${[...PARTITION_POLICIES].join(', ')}`
    );
  }
  if (typeof durationMs !== 'number' || durationMs <= 0 || !isFinite(durationMs)) {
    throw new Error('SoftVariantError: durationMs must be a positive finite number');
  }

  const opId = options.opId || randomUUID();
  const replicaId = options.replicaId;
  if (!replicaId) throw Object.assign(new Error('Partition simulation requires replicaId.'), { code: 'SYNCYTIUM_PARTITION_REPLICA_REQUIRED' });
  const startedAt = Date.now();
  const entry = {
    partitionId: randomUUID(), actorId: options.actorId || replicaId, replicaId,
    policy,
    durationMs,
    startedAt,
    expiresAt: startedAt + durationMs,
    status: 'ACTIVE'
  };

  await syncytium.partitionReplica(sessionId, replicaId, { db: options.db });
  await syncytium.applyOperation(sessionId, {
    opId,
    actorId: entry.actorId,
    kind: {
      type: 'typed_field',
      key: 'partitions', action: 'set', entryKey: replicaId, value: entry
    }
  }, { ...options, replicaId: undefined });

  return {
    partitionId: entry.partitionId,
    policy,
    durationMs,
    startedAt: entry.startedAt,
    expiresAt: entry.expiresAt,
    status: 'ACTIVE', capabilities: partitionService.partitionCapabilities(policy)
  };
}

/* ------------------------------------------------------------------ */
/* Delta listing                                                        */
/* ------------------------------------------------------------------ */

async function listDeltas(context) {
  const { sessionId, options, syncytium } = context;
  await partitionService.assertReadableDuringPartition(sessionId, options, syncytium);
  const snapshot = await syncytium.snapshot(sessionId, options);
  const deltas = snapshot.shared?.sharedFields?.deltas || [];
  const filterType = options.filterType;
  const since = options.since;

  let result = deltas;
  if (filterType) {
    result = result.filter(d => d.type === filterType);
  }
  if (since !== undefined) {
    result = result.filter(d => (d.timestamp || 0) >= since);
  }

  return {
    deltas: result,
    totalCount: deltas.length,
    filteredCount: result.length,
    snapshotAt: Date.now()
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

async function softSnapshot(context) {
  const { sessionId, options, syncytium } = context;
  await partitionService.assertReadableDuringPartition(sessionId, options, syncytium);
  const snapshot = await syncytium.snapshot(sessionId, options);
  const sf = snapshot.shared?.sharedFields || {};

  const deltas = partitionService.uniqueDeltas([...sf.deltas || [], ...sf.localDeltas || [], ...sf.queuedDeltas || []]);
  const antiEntropyLog = sf.antiEntropyLog || [];
  const stalenessBudget = sf.stalenessBudget;
  const budget = latestBudgetValue(stalenessBudget)?.value ?? DEFAULT_STALENESS_BUDGET;

  const seenIds = new Set(antiEntropyLog.map(e => e.deltaId));
  const unseenDeltas = deltas.filter(d => !seenIds.has(d.deltaId));
  const staleness = unseenDeltas.length;

  return {
    sessionId,
    schemaId: 'syncytium-soft-v1',
    metrics: {
      totalDeltas: deltas.length,
      seenDeltas: deltas.length - staleness,
      unseenDeltas: staleness,
      stalenessBudget,
      antiEntropyEntries: antiEntropyLog.length,
      partitionEvents: Object.keys(sf.partitions || {}).length,
      localDeltas: (sf.localDeltas || []).length,
      queuedDeltas: (sf.queuedDeltas || []).length
    },
    stalenessExceedsBudget: staleness > budget,
    compressed: await compressState({ sessionId, options, syncytium }),
    timestamp: Date.now()
  };
}

module.exports = { createSoftVariantService };
