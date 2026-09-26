'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

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
  const enriched = Object.assign({
    deltaId: delta.deltaId || randomUUID(),
    timestamp: Date.now(),
    author: delta.author || 'anonymous',
    vectorClock: delta.vectorClock || {}
  }, delta);

  const opId = options.opId || randomUUID();
  return syncytium.applyOperation(sessionId, {
    opId,
    actorId: options.actorId || 'soft-writer',
    kind: {
      type: 'typed_field',
      key: 'deltas',
      action: 'add',
      value: enriched
    }
  }, options);
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
  const { sessionId, options, syncytium } = context;
  const snapshot = await syncytium.snapshot(sessionId, options);
  const deltas = snapshot.shared?.sharedFields?.deltas || [];
  const antiEntropyLog = snapshot.shared?.sharedFields?.antiEntropyLog || [];

  const seenIds = new Set(antiEntropyLog.map(entry => entry.deltaId));
  const unseen = deltas.filter(d => !seenIds.has(d.deltaId));

  const reconciliationTime = Date.now();
  const entries = unseen.map(delta => ({
    deltaId: delta.deltaId,
    reconciledAt: reconciliationTime,
    author: delta.author,
    vectorClock: delta.vectorClock,
    metadata: { reconciledBy: 'anti_entropy', options: options }
  }));

  if (entries.length === 0) {
    return { reconciled: 0, timestamp: reconciliationTime, stale: true };
  }

  const opId = options.opId || randomUUID();
  await syncytium.applyOperation(sessionId, {
    opId,
    actorId: 'anti-entropy-daemon',
    kind: {
      type: 'typed_field',
      key: 'antiEntropyLog',
      action: 'add',
      value: entries
    }
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
  const deltas = snapshot.shared?.sharedFields?.deltas || [];
  const antiEntropyLog = snapshot.shared?.sharedFields?.antiEntropyLog || [];

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
      action: 'set',
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
  if (!budgetField || !budgetField.value !== undefined) {
    return { budget: DEFAULT_STALENESS_BUDGET, active: false };
  }
  return { budget: budgetField.value, active: true, updatedAt: budgetField.updatedAt };
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
  const entry = {
    partitionId: randomUUID(),
    policy,
    durationMs,
    startedAt: Date.now(),
    expiresAt: Date.now() + durationMs,
    actorId: options.actorId || 'partition-simulator',
    status: 'ACTIVE'
  };

  await syncytium.applyOperation(sessionId, {
    opId,
    actorId: entry.actorId,
    kind: {
      type: 'typed_field',
      key: 'antiEntropyLog',
      action: 'add',
      value: {
        deltaId: `partition-${entry.partitionId}`,
        eventType: 'PARTITION_SIMULATION',
        ...entry
      }
    }
  }, options);

  return {
    partitionId: entry.partitionId,
    policy,
    durationMs,
    startedAt: entry.startedAt,
    expiresAt: entry.expiresAt,
    status: 'ACTIVE'
  };
}

/* ------------------------------------------------------------------ */
/* Delta listing                                                        */
/* ------------------------------------------------------------------ */

async function listDeltas(context) {
  const { sessionId, options, syncytium } = context;
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
  const snapshot = await syncytium.snapshot(sessionId, options);
  const sf = snapshot.shared?.sharedFields || {};

  const deltas = sf.deltas || [];
  const antiEntropyLog = sf.antiEntropyLog || [];
  const stalenessBudget = sf.stalenessBudget;

  const budget = (stalenessBudget && stalenessBudget.value !== undefined)
    ? stalenessBudget.value
    : DEFAULT_STALENESS_BUDGET;

  const seenIds = new Set(antiEntropyLog
    .filter(e => e.deltaId && !e.deltaId.startsWith('partition-'))
    .map(e => e.deltaId));
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
      partitionEvents: antiEntropyLog.filter(
        e => e.eventType === 'PARTITION_SIMULATION'
      ).length
    },
    stalenessExceedsBudget: staleness > budget,
    compressed: await compressState({ sessionId, options, syncytium }),
    timestamp: Date.now()
  };
}

module.exports = { createSoftVariantService };
