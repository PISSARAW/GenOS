'use strict';

const { randomUUID } = require('node:crypto');
const policies = require('./regulationPolicy');
const { withTransaction } = require('../../db');

function measured(state, queue) {
  const capacity = state.capacity;
  const occupied = state.occupied;
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('GNS_CAPACITY_UNKNOWN');
  if (!Number.isSafeInteger(occupied) || occupied < 0) throw new Error('GNS_OCCUPANCY_UNKNOWN');
  const queued = Number(queue.n);
  if (!Number.isSafeInteger(queued) || queued < 0) throw new Error('GNS_QUEUE_UNKNOWN');
  return { capacity, occupied, queued, pressure: Math.min(1, occupied / capacity) };
}

async function sample(db, managerId) {
  return withTransaction(db, () => collect(db, managerId));
}

async function collect(db, managerId) {
  const scope = await policies.managerScope(db, managerId);
  const state = await require('../workerGarageService').state(db, managerId);
  const queue = await db.get(`SELECT count(*) AS n,MIN(created_at) AS oldest FROM garage_queue
    WHERE orchestrator_id=? AND status='queued' AND phase='ready'`, managerId);
  const observedAt = Date.now();
  const oldest = queue.oldest ? Date.parse(queue.oldest.replace(' ', 'T').replace(/Z?$/, 'Z')) : observedAt;
  if (!Number.isFinite(oldest)) throw new Error('GNS_QUEUE_TIME_UNKNOWN');
  return { id: `gns-garage:${randomUUID()}`, scope, managerId, observedAt,
    ...measured(state, queue), oldestWaitMs: Math.max(0, observedAt - oldest),
    sensor: 'garage-sqlite-v1', evidenceStatus: 'OBSERVED', coverage: 'GARAGE_COUNTS_ONLY' };
}

function eventOf(sample) {
  return { id: sample.id, agentId: sample.managerId, eventType: 'NERVOUS_RESOURCE_SAMPLE',
    timestamp: new Date(sample.observedAt).toISOString(), severity: 'info',
    payload: { ...sample.scope, resourcePressure: sample.pressure } };
}

module.exports = { sample, eventOf };
