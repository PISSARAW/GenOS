'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');

function createRealtimeControlVariantService(syncytium) {
  return {
    createRealtimeControlSession: (mission, options) => createSession(mission, options, syncytium),
    recordWcetEvidence: (sessionId, request) => recordWcet(sessionId, request, syncytium),
    executeControlCycle: (sessionId, request) => executeCycle(sessionId, request, syncytium),
    checkControlWatchdog: (sessionId, request) => checkWatchdog(sessionId, request, syncytium),
    planControlSchedule: (jobs) => planSchedule(jobs)
  };
}

function createSession(mission, options = {}, syncytium) {
  return syncytium.createSession(mission, { ...options, schema: schemaService.compile({
    schemaId: 'syncytium-realtime-control-v1', fields: {
      controls: { dataType: 'STATE_MACHINE', consistencyZone: 'SERIALIZABLE', allowedTransitions: options.allowedTransitions || [] },
      safety_outputs: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE' },
      wcet_evidence: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }
    }
  }) });
}

async function recordWcet(sessionId, request = {}, syncytium) {
  validateWcetRequest(request);
  return syncytium.applyOperation(sessionId, {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    kind: { type: 'typed_field', key: 'wcet_evidence', action: 'add', value: {
      evidenceId: request.evidenceId, taskId: request.taskId, upperBoundMs: request.upperBoundMs,
      sampleCount: request.sampleCount, environment: request.environment, artifactId: request.artifactId,
      measuredAt: Number.isSafeInteger(request.measuredAt) ? request.measuredAt : Date.now(), actorId: request.actorId
    } }
  }, request.options || {});
}

function validateWcetRequest(request) {
  const missingIdentity = !request.actorId || !request.taskId || !request.evidenceId || !request.environment || !request.artifactId;
  const missingBounds = !positiveInteger(request.upperBoundMs) || !positiveInteger(request.sampleCount);
  if (missingIdentity || missingBounds) throw controlError('WCET evidence requires taskId, evidenceId, environment, artifactId and positive measurement bounds.');
}

async function executeCycle(sessionId, request = {}, syncytium) {
  validateCycle(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const evidence = findWcetEvidence(snapshot, request.wcetEvidenceId);
  if (!evidence || !evidenceFitsDeadline(evidence, request)) {
    return applyFailsafe({ sessionId, request, snapshot, reason: 'WCET_EVIDENCE_OR_DEADLINE_INVALID', syncytium });
  }
  const startedAt = performance.now();
  const result = await syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: request.operations,
    preconditions: [...(request.preconditions || []), { op: 'state_version', value: snapshot.shared.totalOps }],
    commitPolicy: 'SERIALIZABLE'
  }, request.options || {});
  const elapsedMs = performance.now() - startedAt;
  if (Date.now() > request.deadlineAtMs) {
    const latest = await syncytium.snapshot(sessionId, request.options || {});
    return applyFailsafe({ sessionId, request, snapshot: latest, reason: 'DEADLINE_MISSED', elapsedMs, syncytium });
  }
  return { ...result, control: { status: 'COMPLETED_WITHIN_BUDGET', elapsedMs, wcetEvidenceId: evidence.evidenceId } };
}

function findWcetEvidence(snapshot, evidenceId) {
  return (snapshot.shared.sharedFields.wcet_evidence || []).find((item) => item.evidenceId === evidenceId);
}

function evidenceFitsDeadline(evidence, request) {
  return evidence.taskId === request.taskId && evidence.upperBoundMs <= request.deadlineAtMs - Date.now();
}

function validateCycle(request) {
  if (!request.actorId || !request.taskId || !request.wcetEvidenceId || !Number.isSafeInteger(request.deadlineAtMs)
    || !Array.isArray(request.operations) || !request.operations.length || !isRecord(request.safeOutput)) {
    throw controlError('Control cycle requires a deadline, WCET evidence, operations and a fail-safe output.');
  }
}

async function applyFailsafe(context) {
  const { sessionId, request, snapshot, reason, elapsedMs, syncytium } = context;
  const result = await syncytium.applyTransaction(sessionId, {
    txId: request.failSafeTxId || randomUUID(), operations: [{
      opId: request.failSafeOpId || randomUUID(), actorId: request.actorId,
      kind: { type: 'typed_field', key: 'safety_outputs', action: 'set', entryKey: request.taskId,
        value: { taskId: request.taskId, output: request.safeOutput, reason, triggeredAtMs: Date.now() } }
    }], preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, request.options || {});
  return { ...result, control: { status: 'STOP_AND_REPAIR', reason, elapsedMs: elapsedMs ?? null, failSafeOutput: request.safeOutput } };
}

async function checkWatchdog(sessionId, request = {}, syncytium) {
  const { lastHeartbeatMs, timeoutMs } = request;
  if (!Number.isSafeInteger(lastHeartbeatMs) || !positiveInteger(timeoutMs) || !request.actorId || !request.taskId
    || !isRecord(request.safeOutput)) throw controlError('Watchdog requires heartbeat time, timeout, taskId and fail-safe output.');
  const ageMs = Math.max(0, Date.now() - lastHeartbeatMs);
  if (ageMs <= timeoutMs) return { status: 'ALIVE', ageMs, timeoutMs };
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  return applyFailsafe({ sessionId, request, snapshot, reason: 'WATCHDOG_TIMEOUT', elapsedMs: ageMs, syncytium });
}

function planSchedule(jobs) {
  if (!Array.isArray(jobs) || jobs.some((job) => !validJob(job))) throw controlError('Schedule jobs require id, deadlineMs, priority and positive WCET.');
  const ordered = [...jobs].sort((left, right) => left.deadlineMs - right.deadlineMs
    || right.priority - left.priority || left.jobId.localeCompare(right.jobId));
  let elapsedMs = 0;
  const schedule = ordered.map((job) => {
    const startMs = elapsedMs;
    elapsedMs += job.wcetMs;
    return { jobId: job.jobId, startMs, finishMs: elapsedMs, deadlineMs: job.deadlineMs, schedulable: elapsedMs <= job.deadlineMs };
  });
  return { policy: 'EARLIEST_DEADLINE_FIRST', schedule, priorityInversions: findPriorityInversions(jobs), feasible: schedule.every((item) => item.schedulable) };
}

function findPriorityInversions(jobs) {
  return jobs.flatMap((job) => (job.waitsFor || []).map((resource) => {
    const owner = jobs.find((item) => item.jobId === job.resourceOwners?.[resource]);
    return owner && owner.priority < job.priority ? { waitingJobId: job.jobId, ownerJobId: owner.jobId, resource, inheritedPriority: job.priority } : null;
  }).filter(Boolean));
}

function validJob(job) {
  return job && typeof job.jobId === 'string' && Number.isSafeInteger(job.deadlineMs) && job.deadlineMs >= 0
    && Number.isSafeInteger(job.priority) && job.priority >= 0 && positiveInteger(job.wcetMs);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function controlError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_REALTIME_CONTROL_INVALID' });
}

module.exports = { createRealtimeControlVariantService };
