'use strict';

const crypto = require('node:crypto');
const checkpoints = require('./cellThreadCheckpointService');
const commands = require('./operatorControlCommandService');
const store = require('./operatorControlPersistence');
const checkpointRuntime = require('./cellThreadCheckpointRuntimeControl');
const threads = require('./cellThreadService');

const MAX_IDEMPOTENCY_BYTES = 200;
const ACTIONS = new Set(['pause', 'resume', 'cancel']);

function failure(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function requiredText(value, code, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw failure(code, `${name} is required.`, 400);
  return text;
}

function idempotencyKey(input) {
  const key = requiredText(input.body?.idempotencyKey,
    'STUDIO_CELL_IDEMPOTENCY_REQUIRED', 'idempotencyKey');
  if (Buffer.byteLength(key) > MAX_IDEMPOTENCY_BYTES) {
    throw failure('STUDIO_CELL_IDEMPOTENCY_INVALID',
      'idempotencyKey must not exceed 200 bytes.', 400);
  }
  return key;
}

function scope(input) {
  if (!input.scope?.organizationId || !input.scope?.projectId) {
    throw failure('STUDIO_CELL_SCOPE_REQUIRED', 'Tenant scope is required.', 403);
  }
  return { organizationId: input.scope.organizationId,
    projectId: input.scope.projectId,
    missionId: requiredText(input.missionId, 'STUDIO_CELL_MISSION_REQUIRED', 'missionId'),
    episodeId: requiredText(input.episodeId, 'STUDIO_CELL_EPISODE_REQUIRED', 'episodeId'),
    threadId: requiredText(input.threadId, 'STUDIO_CELL_THREAD_REQUIRED', 'threadId') };
}

async function exactThread(db, input, threadStore) {
  const target = scope(input);
  const row = await threadStore.requireScoped(db, target);
  if (row.episode_id !== target.episodeId) {
    throw failure('STUDIO_CELL_EPISODE_MISMATCH',
      'CellThread belongs to another episode.');
  }
  return { ...target, workerId: row.worker_id };
}

function checkpointId(target, key) {
  const material = [target.organizationId, target.projectId, target.missionId,
    target.episodeId, target.threadId, key].join('\0');
  return `studio_checkpoint_${crypto.createHash('sha256').update(material)
    .digest('hex').slice(0, 32)}`;
}

async function trustedActor(db, input) {
  if (input.authMethod !== 'access_key' || !input.actorId) {
    throw failure('STUDIO_CELL_ACCESS_KEY_REQUIRED',
      'Managed CellThread mutations require an active access key.', 403);
  }
  const actor = await db.get(`SELECT id FROM access_keys WHERE id = ? AND is_active = 1
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`, input.actorId);
  if (!actor) throw failure('STUDIO_CELL_ACCESS_KEY_REQUIRED',
    'Managed CellThread mutations require an active access key.', 403);
  return actor.id;
}

function assertApplied(result) {
  const resultCode = result?.receipt?.resultCode || result?.command?.resultCode;
  if (String(resultCode || '').includes('RECONCILIATION_REQUIRED')) {
    throw failure(resultCode, 'Managed CellThread control requires reconciliation.');
  }
  if (!result?.receipt || result.command?.status !== 'applied'
    || result.receipt.outcome !== 'applied') {
    throw failure(resultCode || 'STUDIO_CELL_CONTROL_UNPROVEN',
      'Managed CellThread control did not produce an applied final receipt.');
  }
  return result;
}

function assertResumed(result) {
  if (!result?.resumption?.proofCode || !result.resumption.proofHash
    || result.thread?.status !== 'active') {
    throw failure('STUDIO_CELL_RESUME_UNPROVEN',
      'Checkpoint resume did not produce an exact runtime proof.');
  }
  return result;
}

function exactCommand(result, target, commandId) {
  const command = result?.command;
  if (!command) throw failure('OPERATOR_CONTROL_COMMAND_NOT_FOUND',
    'Operator control command was not found.', 404);
  const matches = command.commandId === commandId
    && command.organizationId === target.organizationId
    && command.projectId === target.projectId
    && command.missionId === target.missionId
    && command.episodeId === target.episodeId
    && command.threadId === target.threadId;
  if (!matches) throw failure('STUDIO_CELL_COMMAND_SCOPE_DENIED',
    'Operator control command belongs to another CellThread.', 403);
  return result;
}

function create(dependencies = {}) {
  const deps = { checkpoints, commands, store, checkpointRuntime, threads,
    ...dependencies };

  async function sealCheckpoint(db, input) {
    await trustedActor(db, input);
    const target = await exactThread(db, input, deps.threads);
    const key = idempotencyKey(input);
    const id = checkpointId(target, key);
    const manual = Object.prototype.hasOwnProperty.call(input.body || {}, 'context')
      ? { context: input.body.context, evidenceRefs: input.body?.evidenceRefs || [] }
      : null;
    return sealCapturedCheckpoint(db, { deps, target, checkpointId: id, manual });
  }

  async function readCheckpoint(db, input) {
    const target = await exactThread(db, input, deps.threads);
    return deps.checkpoints.get(db, { ...target,
      checkpointId: requiredText(input.checkpointId,
        'CELL_CHECKPOINT_ID_REQUIRED', 'checkpointId') });
  }

  async function resumeCheckpoint(db, input) {
    await trustedActor(db, input);
    const target = await exactThread(db, input, deps.threads);
    idempotencyKey(input);
    const result = await deps.checkpoints.resume(db, { ...target,
      checkpointId: requiredText(input.checkpointId,
        'CELL_CHECKPOINT_ID_REQUIRED', 'checkpointId'),
      runtimeControl: deps.checkpointRuntime.resume });
    return assertResumed(result);
  }

  async function control(db, input) {
    const actorId = await trustedActor(db, input);
    const target = await exactThread(db, input, deps.threads);
    const action = requiredText(input.action, 'OPERATOR_CONTROL_ACTION_INVALID', 'action');
    if (!ACTIONS.has(action)) throw failure('OPERATOR_CONTROL_ACTION_INVALID',
      'Control action must be pause, resume or cancel.', 400);
    const result = await deps.commands.execute(db, { ...target, action,
      actorId, idempotencyKey: idempotencyKey(input),
      reason: input.body?.reason });
    return assertApplied(result);
  }

  async function readCommand(db, input) {
    const target = await exactThread(db, input, deps.threads);
    const commandId = requiredText(input.commandId,
      'OPERATOR_CONTROL_COMMAND_NOT_FOUND', 'commandId');
    return exactCommand(await deps.store.readResult(db, commandId), target, commandId);
  }

  return { sealCheckpoint, readCheckpoint, resumeCheckpoint, control, readCommand };
}

async function sealCapturedCheckpoint(db, input) {
  try {
    const checkpoint = await input.deps.checkpoints.get(db, {
      ...input.target, checkpointId: input.checkpointId
    });
    return { checkpoint, idempotent: true };
  } catch (error) {
    if (error.code !== 'CELL_CHECKPOINT_NOT_FOUND') throw error;
  }
  const captured = await input.deps.checkpointRuntime.capture(db, input.target);
  if (!captured?.proven && captured?.code === 'RUNTIME_UNAVAILABLE' && input.manual) {
    return input.deps.checkpoints.seal(db, { ...input.target,
      checkpointId: input.checkpointId, ...input.manual });
  }
  if (!captured?.proven) throw failure(
    captured?.code || 'RUNTIME_CHECKPOINT_CAPTURE_UNPROVEN',
    'Runtime did not provide a proven native checkpoint.');
  return input.deps.checkpoints.seal(db, { ...input.target,
    checkpointId: input.checkpointId, context: captured.context,
    evidenceRefs: captured.evidenceRefs });
}

module.exports = { ...create(), create, MAX_IDEMPOTENCY_BYTES };
