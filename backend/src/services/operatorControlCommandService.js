'use strict';

const { randomUUID } = require('node:crypto');
const { migrateOperatorControlReceipts } = require('../db/migrations/migrateOperatorControlReceipts');
const store = require('./operatorControlPersistence');
const defaultRuntimeControl = require('./operatorRuntimeControl');

const ACTIONS = new Set(['pause', 'resume', 'cancel']);
const CANCELABLE = new Set(['embryonic', 'ready', 'active', 'waiting_signal',
  'waiting_permission', 'budget_quiescent', 'evidence_quiescent', 'quarantined']);

function requiredText(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw store.coded(`${name} is required.`,
    'OPERATOR_CONTROL_REQUEST_INVALID', 400);
  return normalized;
}

function authorityFor(role, action) {
  if (role === 'admin') return 'admin';
  if (role === 'operator') return action === 'cancel' ? 'emergency_kill' : 'workspace:write';
  return 'read';
}

async function verifiedActor(db, input) {
  const actorId = requiredText(input.actorId, 'actorId');
  const actor = await db.get(`SELECT id, role FROM access_keys WHERE id = ?
    AND is_active = 1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`, actorId);
  if (!actor) throw store.coded('Control actor is not a backend-authenticated access key.',
    'OPERATOR_CONTROL_ACTOR_UNTRUSTED', 403);
  return { actorId: actor.id, authority: authorityFor(actor.role, input.action) };
}

async function normalizedInput(db, input) {
  const action = requiredText(input.action, 'action');
  if (!ACTIONS.has(action)) throw store.coded('Unsupported operator control action.',
    'OPERATOR_CONTROL_ACTION_INVALID', 400);
  const actor = await verifiedActor(db, { ...input, action });
  const normalized = {
    commandId: input.commandId || `control_${randomUUID()}`,
    idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey'), action,
    missionId: requiredText(input.missionId, 'missionId'),
    episodeId: requiredText(input.episodeId, 'episodeId'),
    threadId: requiredText(input.threadId, 'threadId'),
    organizationId: requiredText(input.organizationId, 'organizationId'),
    projectId: requiredText(input.projectId, 'projectId'),
    actorId: actor.actorId, authority: actor.authority,
    reason: String(input.reason || '').trim().slice(0, 1000) || null
  };
  normalized.requestHash = store.digest(JSON.stringify([
    normalized.action, normalized.missionId, normalized.episodeId,
    normalized.threadId, normalized.organizationId, normalized.projectId,
    normalized.actorId, normalized.authority, normalized.reason
  ]));
  return normalized;
}

function authorityAllows(command) {
  if (command.authority === 'admin') return true;
  if (command.action === 'cancel') return command.authority === 'emergency_kill';
  return command.authority === 'workspace:write';
}

function rejected(code, evidence = {}) {
  return { outcome: 'rejected', resultCode: code, updates: [], evidence };
}

function updateFor(target, toStatus, reason) {
  return { threadId: target.thread_id, fromStatus: target.status,
    fromRevision: target.revision, toStatus, stopReason: reason };
}

function controlEvidence(target, result) {
  return { threadId: target.thread_id, workerId: target.worker_id,
    status: target.status, proven: result.proven === true,
    code: result.code || 'CONTROL_RESULT_INVALID', detail: result.detail || null };
}

async function pauseProof(db, target) {
  return db.get(`SELECT receipt.receipt_id AS receiptId
    FROM operator_control_commands command
    JOIN operator_control_receipts receipt ON receipt.command_id = command.command_id
    WHERE command.thread_id = ? AND command.episode_id = ? AND command.mission_id = ?
      AND command.organization_id = ? AND command.project_id = ?
      AND command.action = 'pause' AND command.status = 'applied'
      AND receipt.outcome = 'applied'
      AND json_extract(receipt.evidence_json, '$.quiescentRevision') = ?
    ORDER BY receipt.created_at DESC, receipt.receipt_id DESC LIMIT 1`,
  target.thread_id, target.episode_id, target.mission_id, target.organization_id,
  target.project_id, target.revision);
}

function desiredState(action) {
  return action === 'pause' ? 'waiting_signal' : 'active';
}

async function alreadyAtDesired(db, state) {
  if (state.command.action !== 'pause') {
    return { outcome: 'applied', resultCode: 'ALREADY_RESUMED', updates: [],
      evidence: { target: state.target.thread_id, already: state.desired } };
  }
  if (!await pauseProof(db, state.target)) return rejected('CONTROL_STATE_REJECTED', {
    threadId: state.target.thread_id, status: state.target.status,
    pauseReceiptMissing: true
  });
  return { outcome: 'applied', resultCode: 'ALREADY_PAUSED', updates: [],
    evidence: { target: state.target.thread_id, already: state.desired } };
}

async function singlePrecondition(db, state) {
  const { target, command, desired } = state;
  if (target.revision !== state.command.expectedThreadRevision) {
    return rejected('REVISION_CONFLICT', { expected: state.command.expectedThreadRevision,
      observed: target.revision });
  }
  if (target.status === desired) return alreadyAtDesired(db, state);
  const allowed = command.action === 'pause'
    ? target.status === 'active' : target.status === 'waiting_signal';
  if (!allowed) return rejected('CONTROL_STATE_REJECTED',
    { threadId: target.thread_id, status: target.status });
  const priorPause = command.action === 'resume' ? await pauseProof(db, target) : null;
  if (command.action === 'resume' && !priorPause) {
    return rejected('PAUSE_PROOF_REQUIRED', {
      threadId: target.thread_id, status: target.status
    });
  }
  return { priorPause };
}

async function singlePlan(db, state) {
  const target = await store.exactTarget(db, state.command);
  const desired = desiredState(state.command.action);
  const precondition = await singlePrecondition(db, {
    command: state.command, target, desired
  });
  if (precondition.outcome) return precondition;
  const result = await state.runtimeControl.apply({
    action: state.command.action, target, command: state.command
  });
  const evidence = controlEvidence(target, result || {});
  if (result?.proven !== true) return rejected(result?.code || 'CONTROL_UNAVAILABLE',
    { controls: [evidence] });
  return { outcome: 'applied', resultCode: result.code || 'CONTROL_PROVEN',
    updates: [updateFor(target, desired,
      state.command.action === 'pause' ? state.command.reason || 'operator_pause' : null)],
    evidence: { controls: [evidence], pauseReceiptId: precondition.priorPause?.receiptId || null,
      quiescentRevision: state.command.action === 'pause' ? target.revision + 1 : null } };
}

async function descendants(db, command) {
  return db.all(`WITH RECURSIVE lineage(thread_id) AS (
      SELECT thread_id FROM cell_threads WHERE thread_id = ?
      UNION
      SELECT child.thread_id FROM cell_threads child
      JOIN lineage parent ON child.parent_thread_id = parent.thread_id
      WHERE child.episode_id = ? AND child.mission_id = ?
        AND child.organization_id = ? AND child.project_id = ?
    )
    SELECT cell_threads.* FROM cell_threads JOIN lineage USING(thread_id)
    ORDER BY CASE WHEN cell_threads.thread_id = ? THEN 0 ELSE 1 END,
      cell_threads.created_at, cell_threads.thread_id`, command.threadId,
  command.episodeId, command.missionId, command.organizationId,
  command.projectId, command.threadId);
}

async function cancelPlan(db, state) {
  const targets = await descendants(db, state.command);
  const root = targets.find(target => target.thread_id === state.command.threadId);
  if (revisionConflict(root, state.command.expectedThreadRevision)) return revisionRejection(state, root);
  const candidates = targets.filter(target => CANCELABLE.has(target.status));
  if (candidates.length === 0) return alreadyCancelled(state, targets);
  return await applyCancellationTargets(state, targets, candidates);
}

function revisionConflict(root, expectedRevision) {
  return !root || root.revision !== expectedRevision;
}

function revisionRejection(state, root) {
  return rejected('REVISION_CONFLICT', { expected: state.command.expectedThreadRevision,
    observed: root?.revision ?? null });
}

function alreadyCancelled(state, targets) {
  if (!targets.length || targets.some(row => row.status !== 'apoptotic')) {
    return rejected('TERMINAL_STATE_UNPROVEN', {
      target: state.command.threadId, terminalStatuses: targets.map(row => row.status)
    });
  }
  return { outcome: 'applied', resultCode: 'ALREADY_CANCELLED', updates: [],
    evidence: { target: state.command.threadId, terminalStatuses: targets.map(row => row.status) } };
}

async function applyCancellationTargets(state, targets, candidates) {
  const controls = [];
  const updates = [];
  for (const target of candidates) {
    const result = await state.runtimeControl.apply({ action: 'cancel', target,
      command: state.command });
    controls.push(controlEvidence(target, result || {}));
    if (result?.proven === true) {
      updates.push(updateFor(target, 'apoptotic', state.command.reason || 'operator_cancel'));
    }
  }
  const unavailable = controls.filter(item => !item.proven);
  const unavailableCode = updates.length ? 'CONTROL_PARTIALLY_UNAVAILABLE'
    : unavailable.length === 1 ? unavailable[0].code : 'CONTROL_UNAVAILABLE';
  return { outcome: unavailable.length ? 'rejected' : 'applied',
    resultCode: unavailable.length ? unavailableCode : 'CANCEL_CONFIRMED',
    updates, evidence: { controls, propagatedThreadIds: candidates.map(row => row.thread_id) } };
}

async function buildPlan(db, state) {
  if (!authorityAllows(state.command)) return rejected('AUTHORITY_DENIED', {
    actorId: state.command.actorId, authority: state.command.authority,
    action: state.command.action
  });
  if (state.command.action === 'cancel') return cancelPlan(db, state);
  return singlePlan(db, state);
}

async function execute(db, input, options = {}) {
  await migrateOperatorControlReceipts(db);
  const request = await normalizedInput(db, input);
  request.ownerToken = randomUUID();
  request.leaseExpiresAt = Date.now() + 30000;
  const claimed = await store.claim(db, request);
  if (!claimed.owned) return store.readResult(db, claimed.command.commandId);
  const runtimeControl = options.runtimeControl || defaultRuntimeControl;
  let plan;
  if (claimed.command.attemptCount > 3) {
    plan = rejected('COMMAND_LEASE_EXHAUSTED', {
      attemptCount: claimed.command.attemptCount
    });
  } else try {
    plan = await buildPlan(db, { command: claimed.command, runtimeControl });
  } catch (error) {
    plan = rejected('CONTROL_EXECUTION_ERROR', {
      code: error.code || null, message: String(error.message || error).slice(0, 1000)
    });
  }
  return store.finalize(db, { commandId: claimed.command.commandId,
    ownerToken: claimed.ownerToken, plan });
}

module.exports = { execute };
