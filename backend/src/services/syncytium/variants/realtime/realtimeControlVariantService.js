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

function createSession(mission, options, syncytium) { return syncytium.createSession(mission, { ...options, schema: schemaService.compile({ schemaId: 'syncytium-realtime-control-v1', fields: { controls: { dataType: 'STATE_MACHINE', consistencyZone: 'SERIALIZABLE', allowedTransitions: options?.allowedTransitions || [] }, safety_outputs: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE' }, wcet_evidence: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }, cycle_log: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }, watchdog_log: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }, fail_safe_log: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' } } }) }); }

async function recordWcet(sessionId, request, syncytium) { validateWcetRequest(request); return syncytium.applyOperation(sessionId, buildWcetOp(request), request.options || {}); }
function validateWcetRequest(request) { const missingIdentity = !request.actorId || !request.taskId || !request.evidenceId || !request.environment || !request.artifactId; const missingBounds = !positiveInteger(request.upperBoundMs) || !positiveInteger(request.sampleCount); if (missingIdentity || missingBounds) throw controlError('WCET evidence requires taskId, evidenceId, environment, artifactId and positive measurement bounds.'); }
function buildWcetOp(request) { return { opId: request.opId || randomUUID(), actorId: request.actorId, kind: { type: 'typed_field', key: 'wcet_evidence', action: 'add', value: { evidenceId: request.evidenceId, taskId: request.taskId, upperBoundMs: request.upperBoundMs, sampleCount: request.sampleCount, environment: request.environment, artifactId: request.artifactId, measuredAt: Number.isSafeInteger(request.measuredAt) ? request.measuredAt : Date.now(), actorId: request.actorId } } }; }

async function executeCycle(sessionId, request, syncytium) {
  const preVal = preValidateCycle(request);
  if (!preVal.valid) return applyFailSafeAtomic({ sessionId, request, reason: preVal.reason, syncytium });

  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const evidence = findWcetEvidence(snapshot, request.wcetEvidenceId);
  if (!evidence) return applyFailSafeAtomic({ sessionId, request, reason: 'WCET_EVIDENCE_NOT_FOUND', syncytium });

  const wcetCheck = checkWcetCompatibility(evidence, request);
  if (!wcetCheck.compatible) return applyFailSafeAtomic({ sessionId, request, reason: 'WCET_INCOMPATIBLE', detail: wcetCheck.detail, syncytium });

  const deadlineCheck = checkDeadline(request);
  if (!deadlineCheck.feasible) return applyFailSafeAtomic({ sessionId, request, reason: 'DEADLINE_MISSED_PRECHECK', detail: deadlineCheck.detail, syncytium });

  const startedAt = performance.now();
  if (Date.now() > request.deadlineAtMs) return applyFailSafeAtomic({ sessionId, request, snapshot, reason: 'DEADLINE_ALREADY_MISSED', elapsedMs: performance.now() - startedAt, syncytium });

  try {
    const result = await syncytium.applyTransaction(sessionId, buildCycleTx(request, snapshot), request.options || {});
    const elapsedMs = performance.now() - startedAt;
    if (Date.now() > request.deadlineAtMs) { const latest = await syncytium.snapshot(sessionId, request.options || {}); return applyFailSafeAtomic({ sessionId, request, snapshot: latest, reason: 'DEADLINE_MISSED_POST', elapsedMs, syncytium }); }
    await syncytium.applyOperation(sessionId, buildCycleLogOp(request, startedAt, elapsedMs, evidence.evidenceId), request.options || {});
    return { ...result, control: { status: 'COMPLETED_WITHIN_BUDGET', elapsedMs, wcetEvidenceId: evidence.evidenceId } };
  } catch (e) { return applyFailSafeAtomic({ sessionId, request, snapshot, reason: 'TRANSACTION_FAILED', detail: e.message, elapsedMs: performance.now() - startedAt, syncytium }); }
}

function preValidateCycle(request) { if (!request.actorId || !request.taskId || !request.wcetEvidenceId || !Number.isSafeInteger(request.deadlineAtMs) || !Array.isArray(request.operations) || !request.operations.length || !isRecord(request.safeOutput)) return { valid: false, reason: 'INVALID_CYCLE_REQUEST' }; if (request.deadlineAtMs <= Date.now()) return { valid: false, reason: 'DEADLINE_IN_PAST' }; for (const op of request.operations) if (!op.opId || !op.actorId || !op.kind) return { valid: false, reason: 'INVALID_OPERATION_IN_CYCLE' }; return { valid: true }; }
function findWcetEvidence(snapshot, evidenceId) { return (snapshot.shared.sharedFields.wcet_evidence || []).find(item => item.evidenceId === evidenceId); }
function checkWcetCompatibility(evidence, request) { if (evidence.taskId !== request.taskId) return { compatible: false, detail: 'WCET evidence taskId mismatch' }; const remainingMs = request.deadlineAtMs - Date.now(); if (evidence.upperBoundMs > remainingMs) return { compatible: false, detail: `WCET upper bound ${evidence.upperBoundMs}ms exceeds remaining deadline ${remainingMs}ms` }; return { compatible: true }; }
function checkDeadline(request) { const remainingMs = request.deadlineAtMs - Date.now(); if (remainingMs <= 0) return { feasible: false, detail: 'Deadline already passed' }; return { feasible: true, remainingMs }; }
function buildCycleTx(request, snapshot) { return { txId: request.txId || randomUUID(), operations: request.operations, preconditions: [...(request.preconditions || []), { op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }; }
function buildCycleLogOp(request, startedAt, elapsedMs, evidenceId) { return { opId: randomUUID(), actorId: request.actorId, kind: { type: 'typed_field', key: 'cycle_log', action: 'add', value: { cycleId: request.cycleId || randomUUID(), taskId: request.taskId, startedAt, elapsedMs, deadlineAtMs: request.deadlineAtMs, status: 'COMPLETED_WITHIN_BUDGET', wcetEvidenceId: evidenceId, operationsCount: request.operations.length } } }; }

async function applyFailSafeAtomic(ctx) { const { sessionId, request, snapshot, reason, detail, elapsedMs, syncytium } = ctx; const failSafeRecord = { failSafeId: randomUUID(), taskId: request.taskId, cycleId: request.cycleId, reason, detail: detail || null, safeOutput: request.safeOutput, triggeredAtMs: Date.now(), elapsedMs: elapsedMs ?? null, actorId: request.actorId }; const preconditions = snapshot ? [{ op: 'state_version', value: snapshot.shared.totalOps }] : []; const operations = [buildSafetyOp(request), buildFailSafeLogOp(failSafeRecord)]; if (reason === 'WATCHDOG_TIMEOUT') operations.push(buildWatchdogLogOp(request, elapsedMs)); const result = await syncytium.applyTransaction(sessionId, { txId: request.failSafeTxId || randomUUID(), operations, preconditions, commitPolicy: 'SERIALIZABLE' }, request.options || {}); return { ...result, control: { status: 'STOP_AND_REPAIR', reason, detail, elapsedMs: elapsedMs ?? null, failSafeOutput: request.safeOutput } }; }
function buildSafetyOp(request) { return { opId: request.failSafeOpId || randomUUID(), actorId: request.actorId, kind: { type: 'typed_field', key: 'safety_outputs', action: 'set', entryKey: request.taskId, value: { taskId: request.taskId, output: request.safeOutput, reason: 'FAIL_SAFE', detail: null, triggeredAtMs: Date.now() } } }; }
function buildFailSafeLogOp(record) { return { opId: randomUUID(), actorId: record.actorId, kind: { type: 'typed_field', key: 'fail_safe_log', action: 'add', value: record } }; }
function buildWatchdogLogOp(request, ageMs) { return { opId: randomUUID(), actorId: request.actorId, kind: { type: 'typed_field', key: 'watchdog_log', action: 'add', value: { watchdogId: randomUUID(), taskId: request.taskId, ageMs, timeoutMs: request.timeoutMs, reason: 'WATCHDOG_TIMEOUT', safeOutput: request.safeOutput, triggeredAtMs: Date.now() } } }; }

async function checkWatchdog(sessionId, request, syncytium) {
  const { lastHeartbeatMs, timeoutMs } = request;
  if (!Number.isSafeInteger(lastHeartbeatMs) || !positiveInteger(timeoutMs) || !request.actorId || !request.taskId || !isRecord(request.safeOutput)) throw controlError('Watchdog requires heartbeat time, timeout, taskId and fail-safe output.');
  const ageMs = Math.max(0, Date.now() - lastHeartbeatMs);
  if (ageMs <= timeoutMs) return { status: 'ALIVE', ageMs, timeoutMs };
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  return applyFailSafeAtomic({ sessionId, request, snapshot, reason: 'WATCHDOG_TIMEOUT', elapsedMs: ageMs, syncytium });
}

function planSchedule(jobs) { if (!Array.isArray(jobs) || jobs.some(job => !validJob(job))) throw controlError('Schedule jobs require id, deadlineMs, priority and positive WCET.'); const ordered = [...jobs].sort((l, r) => l.deadlineMs - r.deadlineMs || r.priority - l.priority || l.jobId.localeCompare(r.jobId)); let elapsedMs = 0; const schedule = ordered.map(job => { const startMs = elapsedMs; elapsedMs += job.wcetMs; return { jobId: job.jobId, startMs, finishMs: elapsedMs, deadlineMs: job.deadlineMs, schedulable: elapsedMs <= job.deadlineMs }; }); return { policy: 'EARLIEST_DEADLINE_FIRST', schedule, priorityInversions: findPriorityInversions(jobs), feasible: schedule.every(item => item.schedulable) }; }
function findPriorityInversions(jobs) { return jobs.flatMap(job => (job.waitsFor || []).map(resource => { const owner = jobs.find(item => item.jobId === job.resourceOwners?.[resource]); return owner && owner.priority < job.priority ? { waitingJobId: job.jobId, ownerJobId: owner.jobId, resource, inheritedPriority: job.priority } : null; }).filter(Boolean)); }
function validJob(job) { return job && typeof job.jobId === 'string' && Number.isSafeInteger(job.deadlineMs) && job.deadlineMs >= 0 && Number.isSafeInteger(job.priority) && job.priority >= 0 && positiveInteger(job.wcetMs); }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function controlError(message) { return Object.assign(new Error(message), { code: 'SYNCYTIUM_REALTIME_CONTROL_INVALID' }); }

module.exports = { createRealtimeControlVariantService };
