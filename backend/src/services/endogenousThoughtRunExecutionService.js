'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const SANDBOX_POLICY = Object.freeze({ kind: 'isolated-read-only', readOnly: true,
  networkAllowed: false, mutationAllowed: false, externalActionAllowed: false });

function coded(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function executionIdFor(identity) {
  const value = `${identity.runId}\0${identity.requestHash}`;
  const hash = crypto.createHash('sha256').update(value).digest('hex');
  return `ett_execution_${hash.slice(0, 24)}`;
}

async function loadReservation(db, context) {
  return db.get(`SELECT * FROM endogenous_thought_run_reservations
    WHERE organization_id=? AND project_id=? AND execution_id=?`,
  context.input.organizationId, context.input.projectId, context.executionId);
}

async function insertReservation(db, context) {
  await db.run(`INSERT INTO endogenous_thought_run_reservations
    (organization_id,project_id,execution_id,run_id,episode_id,task_id,request_hash,
     status,sandbox_json,usage_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'reserved',?,?,?,?)`, context.input.organizationId,
  context.input.projectId, context.executionId, context.identity.runId,
  context.input.episodeId, context.binding.receipt.payload.taskId,
  context.identity.requestHash, canonicalJson(context.sandboxPolicy),
  canonicalJson({ tokens: 0, usd: 0, seconds: 0 }), context.timestamp, context.timestamp);
  return loadReservation(db, context);
}

async function claimReservation(db, context) {
  const claimed = await db.run(`UPDATE endogenous_thought_run_reservations
    SET status='running',started_at=COALESCE(started_at,?),updated_at=?
    WHERE organization_id=? AND project_id=? AND execution_id=? AND status='reserved'`,
  context.timestamp, context.timestamp, context.input.organizationId,
  context.input.projectId, context.executionId);
  const reservation = await loadReservation(db, context);
  if (claimed.changes === 1) return { reservation, mode: 'execute' };
  if (reservation?.status === 'running') return { reservation, mode: 'recover' };
  throw coded('ENDOGENOUS_RUN_RESERVATION_TERMINAL',
    'The durable execution reservation cannot be claimed.',
    { executionId: context.executionId, reservationStatus: reservation?.status || null });
}

async function finishReservation(db, context) {
  const updated = await db.run(`UPDATE endogenous_thought_run_reservations
    SET status='completed',usage_json=?,completed_at=?,updated_at=?
    WHERE organization_id=? AND project_id=? AND execution_id=? AND status='running'`,
  canonicalJson(context.usage), context.timestamp, context.timestamp,
  context.input.organizationId, context.input.projectId, context.executionId);
  if (updated.changes !== 1) {
    throw coded('ENDOGENOUS_RUN_RESERVATION_CONFLICT',
      'The execution reservation cannot be completed.', { executionId: context.executionId });
  }
}

async function stopReservation(db, context) {
  const status = context.cancelled ? 'cancelled' : 'failed';
  return withTransaction(db, async () => {
    await db.run(`UPDATE endogenous_thought_run_reservations
      SET status=?,error_code=?,completed_at=?,updated_at=?
      WHERE organization_id=? AND project_id=? AND execution_id=? AND status IN ('reserved','running')`,
    status, context.errorCode, context.timestamp, context.timestamp,
    context.input.organizationId, context.input.projectId, context.executionId);
    await db.run("UPDATE ontogenesis_runs SET status='failed' WHERE id=? AND status='running'",
      context.identity.runId);
    await db.run("UPDATE ontogenesis_backlog SET status='blocked',updated_at=? WHERE id=? AND status='doing'",
      context.timestamp, context.binding.receipt.payload.taskId);
  });
}

function validSandbox(sandbox) {
  return sandbox && typeof sandbox.execute === 'function'
    && sandbox.kind === SANDBOX_POLICY.kind && sandbox.readOnly === true
    && sandbox.networkAllowed === false && sandbox.mutationAllowed === false
    && sandbox.externalActionAllowed === false;
}

function externalAdapter(input) {
  if (!validSandbox(input.sandbox)) {
    throw coded('ENDOGENOUS_RUN_SANDBOX_REQUIRED',
      'Injected workers require an isolated read-only sandbox adapter.');
  }
  if (!input.usageMeter || typeof input.usageMeter.snapshot !== 'function') {
    throw coded('ENDOGENOUS_RUN_USAGE_METER_REQUIRED',
      'Injected workers require an external usage meter.');
  }
  return { execute: (request) => input.sandbox.execute({ ...request, worker: input.worker }),
    recover: typeof input.sandbox.recover === 'function'
      ? (request) => input.sandbox.recover(request) : null,
    cancel: typeof input.sandbox.cancel === 'function'
      ? (request) => input.sandbox.cancel(request) : null,
    measure: (request) => input.usageMeter.snapshot(request) };
}

function builtinAdapter(defaultResult) {
  return { execute: async () => defaultResult, recover: async () => ({ status: 'completed',
    result: defaultResult }), cancel: async () => {},
  measure: async () => ({ tokens: 0, usd: 0, seconds: 0 }) };
}

function adapterFor(input, defaultResult) {
  return typeof input.worker === 'function' || (input.worker && typeof input.worker === 'object')
    ? externalAdapter(input) : builtinAdapter(defaultResult);
}

function assertExecutionInput(input) {
  if (!input.worker) return;
  externalAdapter(input);
  if (input.signal && typeof input.sandbox.cancel !== 'function') {
    throw coded('ENDOGENOUS_RUN_CANCELLATION_REQUIRED',
      'Cancellable execution requires a sandbox cancellation handler.');
  }
}

function cancellationError(executionId) {
  return coded('ENDOGENOUS_RUN_CANCELLED', 'Execution was cancelled.', { executionId });
}

async function withCancellation(promise, context) {
  const signal = context.input.signal;
  if (!signal) return promise;
  if (signal.aborted) throw cancellationError(context.executionId);
  let listener;
  const cancelled = new Promise((resolve, reject) => {
    listener = async () => {
      try {
        if (context.adapter.cancel) await context.adapter.cancel({ executionId: context.executionId,
          reason: signal.reason || 'aborted' });
      } finally { reject(cancellationError(context.executionId)); }
    };
    signal.addEventListener('abort', listener, { once: true });
  });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener('abort', listener); }
}

async function invokeAdapter(context, mode) {
  const request = { executionId: context.executionId, signal: context.input.signal || null,
    question: context.question.payload, budget: context.episode.budget,
    boundaries: context.boundaries, sandbox: SANDBOX_POLICY };
  if (mode === 'execute') return withCancellation(
    Promise.resolve(context.adapter.execute(request)), context);
  if (!context.adapter.recover) {
    throw coded('ENDOGENOUS_RUN_RECOVERY_REQUIRED',
      'Execution is ambiguous and requires sandbox recovery; it will not be reinvoked.',
      { executionId: context.executionId });
  }
  const recovered = await withCancellation(Promise.resolve(context.adapter.recover(request)), context);
  if (recovered?.status !== 'completed') {
    throw coded('ENDOGENOUS_RUN_RECOVERY_REQUIRED',
      'The sandbox has not produced a recoverable completed result.',
      { executionId: context.executionId });
  }
  return recovered.result;
}

async function executeReservation(db, context) {
  const adapter = adapterFor(context.input, context.defaultResult);
  const claimed = await claimReservation(db, context);
  try {
    const result = await invokeAdapter({ ...context, adapter }, claimed.mode);
    const usage = await withCancellation(Promise.resolve(adapter.measure({
      executionId: context.executionId, signal: context.input.signal || null })),
    { ...context, adapter });
    return { result, usage, executionId: context.executionId,
      recovered: claimed.mode === 'recover', sandbox: SANDBOX_POLICY };
  } catch (error) {
    if (error.code !== 'ENDOGENOUS_RUN_RECOVERY_REQUIRED') {
      await stopReservation(db, { ...context, cancelled: error.code === 'ENDOGENOUS_RUN_CANCELLED',
        errorCode: error.code || 'ENDOGENOUS_RUN_WORKER_FAILED' });
    }
    throw error;
  }
}

module.exports = { SANDBOX_POLICY, executionIdFor, loadReservation, insertReservation,
  executeReservation, finishReservation, stopReservation, validSandbox,
  assertExecutionInput };
