'use strict';

const crypto = require('crypto');

const MODES = Object.freeze([
  'surface', 'ramp', 'stacker', 'puzzle', 'tower', 'carousel',
  'reciprocal_lift', 'shuttle', 'agv', 'pallet', 'cold_storage', 'collector'
]);

const ACTIVE_STATES = new Set(['running', 'reserved', 'blocked']);
const PROTECTED_STATES = new Set(['quarantined', 'terminating', 'completed', 'failed']);

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(input = {}) {
  const request = input.request || input;
  return {
    mode: MODES.includes(request.mode) ? request.mode : null,
    priority: clamp(finite(request.priority, 0.5), 0, 1),
    urgency: clamp(finite(request.urgency, 0), 0, 1),
    persistence: clamp(finite(request.persistence, 0), 0, 1),
    isolation: clamp(finite(request.isolation, 0.5), 0, 1),
    retrievalRate: clamp(finite(request.retrievalRate, 0.5), 0, 1),
    specialization: clamp(finite(request.specialization, 0), 0, 1),
    sharedState: clamp(finite(request.sharedState, 0), 0, 1),
    preemptible: request.preemptible === true,
    queueable: request.queueable !== false,
    available: Math.max(0, Math.floor(finite(input.available, request.available || 0))),
    activeWorkers: Array.isArray(input.activeWorkers) ? input.activeWorkers : []
  };
}

function scoreModes(input) {
  const value = normalize(input);
  return {
    surface: 0.8 - value.isolation * 0.4,
    ramp: 0.55 + value.sharedState * 0.25,
    stacker: 0.7 - value.retrievalRate * 0.2,
    puzzle: 0.45 + value.retrievalRate * 0.4 + value.queueable * 0.1,
    tower: 0.35 + value.persistence * 0.35 + value.isolation * 0.2,
    carousel: 0.3 + value.priority * 0.35 + value.queueable * 0.2,
    reciprocal_lift: 0.4 + value.urgency * 0.35,
    shuttle: 0.5 + value.sharedState * 0.2 + value.isolation * 0.2,
    agv: 0.35 + value.specialization * 0.45 + value.isolation * 0.15,
    pallet: 0.45 + value.isolation * 0.35 + value.persistence * 0.15,
    cold_storage: 0.2 + value.persistence * 0.6 - value.urgency * 0.35,
    collector: 0.2 + value.specialization * 0.7
  };
}

function chooseMode(input = {}) {
  const value = normalize(input);
  if (value.mode) return { mode: value.mode, scores: scoreModes(value) };
  const scores = scoreModes(value);
  const mode = Object.entries(scores).sort((left, right) => right[1] - left[1])[0][0];
  return { mode, scores };
}

function activeWorkers(workers) {
  return workers.filter((worker) => ACTIVE_STATES.has(worker.status));
}

function preemptionCandidates(workers) {
  return activeWorkers(workers)
    .filter((worker) => worker.preemptible === true && worker.snapshotCapable === true && !PROTECTED_STATES.has(worker.status))
    .sort((left, right) => finite(left.priority, 0.5) - finite(right.priority, 0.5))
    .map((worker) => worker.id);
}

function planAdmission(input = {}) {
  const value = normalize(input);
  const selected = chooseMode(value);
  const active = activeWorkers(value.activeWorkers);
  const hasCapacity = value.available > 0;
  const candidates = preemptionCandidates(value.activeWorkers.filter((worker) => Number(worker.priority) < value.priority));
  if (hasCapacity) return admissionResult({ value, selected, decision: 'admit', active, preempt: [], reason: null });
  if (value.urgency >= 0.8 && require('./garagePolicies').resolve(selected.mode).preemption && candidates.length) {
    return admissionResult({ value, selected, decision: 'preempt', active, preempt: [candidates[0]], reason: 'urgent_capacity_reclaim' });
  }
  if (value.queueable) return admissionResult({ value, selected, decision: 'queue', active, preempt: [], reason: 'capacity_exhausted' });
  return admissionResult({ value, selected, decision: 'reject', active, preempt: [], reason: 'capacity_exhausted_non_queueable' });
}

function admissionResult(input) {
  const { value, selected, decision, active, preempt, reason } = input;
  return {
    decision,
    mode: selected.mode,
    modeScores: selected.scores,
    priority: value.priority,
    occupied: active.length,
    available: value.available,
    preemptWorkerIds: preempt,
    reason
  };
}

function createLease(input = {}) {
  const now = finite(input.now, Date.now());
  const ttlMs = Math.min(300000, Math.max(1000, Math.floor(finite(input.ttlMs, 300000))));
  if (!input.orchestratorId || !input.workerId) throw new Error('Lease requires an orchestratorId and workerId.');
  return {
    leaseId: crypto.randomUUID(),
    orchestratorId: input.orchestratorId,
    workerId: input.workerId,
    issuedAt: now,
    expiresAt: now + ttlMs,
    mode: chooseMode(input).mode
  };
}

function leaseExpired(lease, now = Date.now()) {
  return !lease || !Number.isFinite(lease.expiresAt) || finite(now, Date.now()) >= lease.expiresAt;
}

function renewLease(lease, input = {}) {
  if (leaseExpired(lease, input.now)) throw Object.assign(new Error('Garage lease has expired.'), { code: 'GARAGE_LEASE_EXPIRED' });
  const now = finite(input.now, Date.now());
  const ttlMs = Math.min(300000, Math.max(1000, Math.floor(finite(input.ttlMs, 300000))));
  return { ...lease, issuedAt: now, expiresAt: now + ttlMs };
}

function createQueue() {
  const entries = new Map();
  function enqueue(request = {}) {
    if (!request.requestId) throw new Error('Queued garage request requires requestId.');
    const entry = { ...request, enqueuedAt: finite(request.enqueuedAt, Date.now()) };
    entries.set(request.requestId, entry);
    return entry;
  }
  function next() {
    return [...entries.values()].sort((left, right) => {
      const priorityDelta = finite(right.priority, 0.5) - finite(left.priority, 0.5);
      return priorityDelta || left.enqueuedAt - right.enqueuedAt;
    })[0] || null;
  }
  function remove(requestId) {
    const entry = entries.get(requestId) || null;
    entries.delete(requestId);
    return entry;
  }
  return { enqueue, next, remove, list: () => [...entries.values()] };
}

function buildSnapshotPlan(input = {}) {
  const value = normalize(input);
  if (!value.activeWorkers.length) return { required: false, reason: 'no_active_worker' };
  const ids = preemptionCandidates(value.activeWorkers);
  if (!ids.length) return { required: false, reason: 'no_safe_candidate' };
  return {
    required: true,
    workerId: ids[0],
    reason: 'preemption_requires_verified_snapshot',
    mustVerifySnapshot: true,
    restoreBeforeReuse: true
  };
}


module.exports = {
  MODES,
  chooseMode,
  planAdmission,
  createLease,
  leaseExpired,
  renewLease,
  createQueue,
  buildSnapshotPlan,
  ...require('./garageQueueStore')
};
