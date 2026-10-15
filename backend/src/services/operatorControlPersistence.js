'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');

function coded(message, code, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function commandView(row) {
  if (!row) return null;
  return {
    commandId: row.command_id, idempotencyKey: row.idempotency_key,
    action: row.action, missionId: row.mission_id, episodeId: row.episode_id,
    threadId: row.thread_id, organizationId: row.organization_id,
    projectId: row.project_id, actorId: row.actor_id, authority: row.authority,
    reason: row.reason, expectedThreadRevision: row.expected_thread_revision,
    status: row.status, resultCode: row.result_code, revision: row.revision,
    leaseExpiresAt: row.lease_expires_at, attemptCount: row.attempt_count,
    createdAt: row.created_at, finalizedAt: row.finalized_at
  };
}

function receiptView(row) {
  if (!row) return null;
  return {
    receiptId: row.receipt_id, commandId: row.command_id, outcome: row.outcome,
    resultCode: row.result_code, evidence: JSON.parse(row.evidence_json),
    receiptHash: row.receipt_hash, createdAt: row.created_at
  };
}

async function readResult(db, commandId) {
  const command = await db.get('SELECT * FROM operator_control_commands WHERE command_id = ?', commandId);
  const receipt = await db.get('SELECT * FROM operator_control_receipts WHERE command_id = ?', commandId);
  if (receipt && receipt.receipt_hash !== receiptDigest(command, receipt)) {
    throw coded('Operator control receipt integrity check failed.',
      'OPERATOR_CONTROL_RECEIPT_INTEGRITY_FAILURE', 500);
  }
  return { command: commandView(command), receipt: receiptView(receipt) };
}

async function exactTarget(db, input) {
  const row = await db.get(`SELECT * FROM cell_threads WHERE thread_id = ?`, input.threadId);
  if (!row) throw coded('CellThread target was not found.', 'OPERATOR_CONTROL_THREAD_NOT_FOUND', 404);
  if (row.organization_id !== input.organizationId || row.project_id !== input.projectId) {
    throw coded('CellThread target belongs to another tenant.', 'OPERATOR_CONTROL_SCOPE_DENIED', 403);
  }
  if (row.mission_id !== input.missionId || row.episode_id !== input.episodeId) {
    throw coded('CellThread target belongs to another mission or episode.',
      'OPERATOR_CONTROL_TARGET_COLLISION');
  }
  return row;
}

async function claim(db, input) {
  return withTransaction(db, async () => {
    const existing = await db.get(`SELECT * FROM operator_control_commands
      WHERE organization_id = ? AND project_id = ? AND idempotency_key = ?`,
    input.organizationId, input.projectId, input.idempotencyKey);
    if (existing) {
      if (existing.request_hash !== input.requestHash) {
        throw coded('Idempotency key is already bound to another control request.',
          'OPERATOR_CONTROL_IDEMPOTENCY_COLLISION');
      }
      if (existing.status !== 'pending' || existing.lease_expires_at > Date.now()) {
        return { owned: false, command: commandView(existing) };
      }
      const takeover = await db.run(`UPDATE operator_control_commands
        SET owner_token = ?, lease_expires_at = ?, attempt_count = attempt_count + 1
        WHERE command_id = ? AND status = 'pending' AND owner_token = ?
          AND lease_expires_at = ?`, input.ownerToken, input.leaseExpiresAt,
      existing.command_id, existing.owner_token, existing.lease_expires_at);
      const current = await db.get('SELECT * FROM operator_control_commands WHERE command_id = ?',
        existing.command_id);
      return { owned: takeover.changes === 1, ownerToken: input.ownerToken,
        command: commandView(current) };
    }
    const target = await exactTarget(db, input);
    await db.run(`INSERT INTO operator_control_commands
      (command_id, idempotency_key, request_hash, action, mission_id, episode_id,
        thread_id, organization_id, project_id, actor_id, authority, reason,
        expected_thread_revision, owner_token, lease_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.commandId,
    input.idempotencyKey, input.requestHash, input.action, input.missionId,
    input.episodeId, input.threadId, input.organizationId, input.projectId,
    input.actorId, input.authority, input.reason, target.revision,
    input.ownerToken, input.leaseExpiresAt);
    return { owned: true, ownerToken: input.ownerToken, command: commandView({ ...target,
      command_id: input.commandId, idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash, action: input.action,
      mission_id: input.missionId, episode_id: input.episodeId,
      thread_id: input.threadId, organization_id: input.organizationId,
      project_id: input.projectId, actor_id: input.actorId, authority: input.authority,
      reason: input.reason, expected_thread_revision: target.revision,
      lease_expires_at: input.leaseExpiresAt, attempt_count: 1,
      status: 'pending', result_code: null, revision: 0,
      created_at: null, finalized_at: null }) };
  });
}

async function classifyUpdates(db, updates) {
  const matching = [];
  const conflicts = [];
  for (const update of updates) {
    const row = await db.get('SELECT status, revision FROM cell_threads WHERE thread_id = ?',
      update.threadId);
    if (row && row.status === update.fromStatus && row.revision === update.fromRevision) {
      matching.push(update);
    } else {
      conflicts.push({ threadId: update.threadId, expectedStatus: update.fromStatus,
        expectedRevision: update.fromRevision, observedStatus: row?.status || null,
        observedRevision: row?.revision ?? null });
    }
  }
  return { matching, conflicts };
}

async function applyUpdates(db, updates) {
  for (const update of updates) {
    const changed = await db.run(`UPDATE cell_threads SET status = ?, stop_reason = ?,
      revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE thread_id = ? AND status = ? AND revision = ?`, update.toStatus,
    update.stopReason || null, update.threadId, update.fromStatus, update.fromRevision);
    if (changed.changes !== 1) throw coded('CellThread changed during command application.',
      'OPERATOR_CONTROL_REVISION_CONFLICT');
  }
}

function receiptMaterial(command, values) {
  return [command.command_id, command.request_hash, command.action,
    command.mission_id, command.episode_id, command.thread_id,
    command.organization_id, command.project_id, command.actor_id, command.authority,
    command.reason, command.expected_thread_revision, values.outcome, values.resultCode,
    values.evidenceJson].join('\0');
}

function receiptDigest(command, receipt) {
  return digest(receiptMaterial(command, { outcome: receipt.outcome,
    resultCode: receipt.result_code, evidenceJson: receipt.evidence_json }));
}

function receiptRecord(command, plan) {
  const evidenceJson = JSON.stringify(plan.evidence || {});
  const material = receiptMaterial(command, { outcome: plan.outcome,
    resultCode: plan.resultCode, evidenceJson });
  const receiptHash = digest(material);
  return { receiptId: `control_receipt_${receiptHash.slice(0, 32)}`,
    receiptHash, evidenceJson };
}

function projectionPlan(plan, projection) {
  const evidence = { ...plan.evidence,
    projectionAppliedThreadIds: projection.matching.map(item => item.threadId),
    projectionConflicts: projection.conflicts };
  const reconciled = projection.conflicts.length && plan.outcome === 'applied';
  return { ...plan, updates: projection.matching, evidence,
    resultCode: reconciled ? 'CONTROL_APPLIED_RECONCILIATION_REQUIRED' : plan.resultCode };
}

async function finalizePending(db, state) {
  const projection = await classifyUpdates(db, state.plan.updates || []);
  const plan = projectionPlan(state.plan, projection);
  await applyUpdates(db, plan.updates || []);
  const changed = await db.run(`UPDATE operator_control_commands
    SET status = ?, result_code = ?, revision = revision + 1,
      finalized_at = CURRENT_TIMESTAMP
    WHERE command_id = ? AND status = 'pending' AND revision = 0 AND owner_token = ?`,
  plan.outcome, plan.resultCode, state.command.command_id, state.ownerToken);
  if (changed.changes !== 1) return readResult(db, state.command.command_id);
  const receipt = receiptRecord(state.command, plan);
  await db.run(`INSERT INTO operator_control_receipts
    (receipt_id, command_id, outcome, result_code, evidence_json, receipt_hash)
    VALUES (?, ?, ?, ?, ?, ?)`, receipt.receiptId, state.command.command_id,
  plan.outcome, plan.resultCode, receipt.evidenceJson, receipt.receiptHash);
  return readResult(db, state.command.command_id);
}

async function finalize(db, input) {
  return withTransaction(db, async () => {
    const command = await db.get('SELECT * FROM operator_control_commands WHERE command_id = ?',
      input.commandId);
    if (!command) throw coded('Operator control command disappeared.',
      'OPERATOR_CONTROL_COMMAND_NOT_FOUND', 404);
    if (command.status !== 'pending') return readResult(db, input.commandId);
    if (command.owner_token !== input.ownerToken) return readResult(db, input.commandId);
    return finalizePending(db, { command, plan: input.plan, ownerToken: input.ownerToken });
  });
}

module.exports = { claim, finalize, readResult, exactTarget, coded, digest };
