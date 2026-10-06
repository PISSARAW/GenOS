'use strict';

// Policies compose with (never replace) project capacity, authority and evidence gates.
const POLICIES = Object.freeze({
  surface: { order: 'fifo' },
  ramp: { order: 'dependency', dependencies: true },
  stacker: { order: 'lifo', laneLimit: 1 },
  puzzle: { order: 'priority', preemption: true },
  tower: { order: 'priority', laneLimit: 2 },
  carousel: { order: 'fair' },
  reciprocal_lift: { order: 'urgency', preemption: true },
  shuttle: { order: 'affinity', affinity: true },
  agv: { order: 'cost', affinity: true },
  pallet: { order: 'fifo', isolated: true },
  cold_storage: { order: 'fifo', dormant: true, preemption: true },
  collector: { order: 'affinity', protected: true, affinity: true }
});

function resolve(mode) {
  const policy = POLICIES[mode];
  if (!policy) throw Object.assign(new Error(`Unknown garage mode: ${mode}`), { code: 'GARAGE_MODE_INVALID' });
  return { mode, ...policy };
}

function age(row, now) {
  return Math.max(0, now - Date.parse(`${row.created_at.replace(' ', 'T').replace(/Z$/, '')}Z`)) / 60000;
}

function score(row, context) {
  const request = JSON.parse(row.request_json);
  const policy = resolve(row.mode);
  const waiting = age(row, context.now);
  const order = {
    fifo: waiting, lifo: -Math.min(waiting, 5) * 4, dependency: waiting,
    priority: Number(row.priority) * 10,
    urgency: Number(request.urgency || 0) * 10 + Number(row.priority),
    fair: -Number(context.served[row.orchestrator_id] || 0) * 10,
    affinity: require('./garageRoutingService').affinity(row, request) + Number(row.priority),
    cost: -require('./garageRoutingService').cost(row, request, context)
  };
  // Aging dominates any bounded priority after sufficient waiting.
  return order[policy.order] + waiting * 2;
}

async function eligible(db, row) {
  const request = JSON.parse(row.request_json);
  const policy = resolve(row.mode);
  if (policy.dependencies && !await dependenciesReady(db, request)) return false;
  if (!await capacityReady(db, row)) return false;
  if (!policy.laneLimit) return true;
  const active = await db.get(`SELECT COUNT(*) AS count FROM garage_queue
    WHERE orchestrator_id = ? AND status IN ('claimed','running')
      AND json_extract(request_json, '$.lane') = ?`, row.orchestrator_id, request.lane);
  return active.count < policy.laneLimit;
}

async function capacityReady(db, row) {
  try { await require('./workerGarageService').requireAvailableSlot(db, row.orchestrator_id); return true; }
  catch (failure) {
    if (['WORKER_GARAGE_FULL', 'PROJECT_WORKER_CAPACITY_FULL'].includes(failure.code)) return false;
    throw failure;
  }
}

async function dependenciesReady(db, request) {
  for (const id of request.dependsOn || []) {
    const row = await db.get(`SELECT status FROM garage_queue WHERE request_id = ?
      AND orchestrator_id = ?`, id, request.orchestratorId);
    if (row?.status !== 'completed') return false;
  }
  return true;
}

module.exports = { POLICIES, resolve, score, eligible };
