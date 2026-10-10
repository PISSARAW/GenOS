'use strict';

const { normalizeRef, referenceKey } = require('./referenceKey');

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function agentIdOf(input) {
  const id = String(input?.consumerAgentId || '').trim();
  if (!id || id.length > 256) throw failure('SCI_SUB_AGENT_REQUIRED', 'Consumer agent id is required.');
  return id;
}

async function assertAgentScope(db, ref, agentId) {
  const row = await db.get(`SELECT a.workspace_id, w.organization_id, w.project_id
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
  if (!row || row.workspace_id !== ref.workspaceId ||
      row.organization_id !== ref.organizationId || row.project_id !== ref.projectId) {
    throw failure('SCI_SUB_SCOPE', 'Consumer agent is outside reference scope.');
  }
}

async function referenceStatus(db, ref) {
  const row = await db.get(`SELECT status FROM scientific_references
    WHERE organization_id = ? AND project_id = ? AND workspace_id = ?
      AND object_type = ? AND object_id = ? AND version = ?`,
  ref.organizationId, ref.projectId, ref.workspaceId,
  ref.objectType, ref.objectId, ref.version);
  return row?.status || null;
}

async function subscribeReference(db, input) {
  const ref = normalizeRef(input?.ref);
  const agentId = agentIdOf(input);
  await assertAgentScope(db, ref, agentId);
  const key = referenceKey(ref);
  const previous = await db.get(`SELECT state FROM scientific_reference_subscriptions
    WHERE reference_key = ? AND consumer_agent_id = ?`, [key, agentId]);
  if (previous?.state === 'stale') {
    throw failure('SCI_SUB_STALE', 'A stale subscription cannot be reactivated.');
  }
  const status = await referenceStatus(db, ref);
  if (status === 'stale') {
    throw failure('SCI_SUB_STALE', 'A stale reference cannot be subscribed to.');
  }
  if (previous) return { ref, consumerAgentId: agentId, state: previous.state, created: false };
  if (status === 'verified') {
    throw failure('SCI_SUB_LATE', 'Subscription must precede publication.');
  }
  await db.run(`INSERT INTO scientific_reference_subscriptions
    (reference_key, reference_ref_json, consumer_agent_id)
    VALUES (?, ?, ?)`, [key, JSON.stringify(ref), agentId]);
  return { ref, consumerAgentId: agentId, state: 'open', created: true };
}

async function subscribedAgents(db, ref, states) {
  const key = referenceKey(ref);
  const placeholders = states.map(() => '?').join(', ');
  const rows = await db.all(`SELECT consumer_agent_id FROM scientific_reference_subscriptions
    WHERE reference_key = ? AND state IN (${placeholders})`, [key, ...states]);
  return rows.map((row) => row.consumer_agent_id);
}

async function satisfySubscriptions(db, input) {
  const receiptId = String(input?.verificationReceiptId || '').trim();
  if (!receiptId) throw failure('SCI_SUB_RECEIPT_REQUIRED', 'Verification receipt id is required.');
  const result = await db.run(`UPDATE scientific_reference_subscriptions
    SET state = 'satisfied', satisfaction_receipt_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE reference_key = ? AND state = 'open'`, [receiptId, referenceKey(input.ref)]);
  return result.changes;
}

async function staleSubscriptions(db, ref) {
  const result = await db.run(`UPDATE scientific_reference_subscriptions
    SET state = 'stale', updated_at = CURRENT_TIMESTAMP
    WHERE reference_key = ? AND state IN ('open', 'satisfied')`, [referenceKey(ref)]);
  return result.changes;
}

module.exports = { subscribeReference, subscribedAgents, satisfySubscriptions, staleSubscriptions };
