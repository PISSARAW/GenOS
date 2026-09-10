/**
 * Platform approval persistence (point #8 — approbations).
 *
 * Owns the platform_approvals rows: schema self-heal (payload_hash column),
 * creation with bound payload hash, pending lookup, atomic decide-and-claim
 * (single UPDATE guarded by status='pending', binds the payload hash when the
 * row was created by a legacy writer such as the MCP controller) and audit.
 */

const policy = require('./platformApprovalPolicy');

async function ensureApprovalSchema(db) {
  const columns = await db.all('PRAGMA table_info(platform_approvals)');
  const names = columns.map((column) => column.name);
  if (names.indexOf('payload_hash') === -1) {
    await db.exec('ALTER TABLE platform_approvals ADD COLUMN payload_hash TEXT');
  }
}

function newApprovalId() {
  return `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function listApprovals(db, scope) {
  await ensureApprovalSchema(db);
  return db.all(
    'SELECT * FROM platform_approvals WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC',
    scope.organizationId,
    scope.projectId
  );
}

async function createApproval(db, input) {
  await ensureApprovalSchema(db);
  const body = input.body || {};
  const payloadJson = JSON.stringify(body);
  const payloadHash = policy.hashPayload(payloadJson);
  const id = newApprovalId();
  await db.run(
    'INSERT INTO platform_approvals (id,action,agent_id,risk,uncertainty,requested_by,organization_id,project_id,payload_json,payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    body.action || 'unknown',
    body.agentId || null,
    body.risk || 'high',
    Number(body.uncertainty || 0),
    input.requestedBy,
    input.scope.organizationId,
    input.scope.projectId,
    payloadJson,
    payloadHash
  );
  return { id, status: 'pending', payloadHash, ...body };
}

async function findApproval(db, id, scope) {
  await ensureApprovalSchema(db);
  return db.get(
    'SELECT * FROM platform_approvals WHERE id = ? AND organization_id = ? AND project_id = ?',
    id,
    scope.organizationId,
    scope.projectId
  );
}

async function claimApproval(db, claim) {
  const updated = await db.run(
    "UPDATE platform_approvals SET status=?, decision_by=?, reason=?, decided_at=CURRENT_TIMESTAMP, payload_hash=COALESCE(payload_hash, ?) WHERE id=? AND organization_id=? AND project_id=? AND status='pending'",
    claim.status,
    claim.decisionBy,
    claim.reason,
    claim.payloadHash,
    claim.id,
    claim.organizationId,
    claim.projectId
  );
  return updated.changes > 0;
}

async function recordDecisionAudit(db, entry) {
  await db.run(
    'INSERT INTO audit_logs (actor,action,resource,decision,reason,organization_id,project_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    entry.actor,
    'APPROVAL_DECISION',
    entry.approvalId,
    entry.status,
    entry.reason || 'operator decision',
    entry.organizationId,
    entry.projectId
  );
}

async function recordExecutionAudit(db, entry) {
  await db.run(
    'INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    entry.actor,
    entry.agentId,
    'APPROVED_TOOL_EXECUTION',
    entry.toolName,
    entry.decision,
    entry.reason,
    entry.executionJson
  );
}

module.exports = {
  ensureApprovalSchema,
  listApprovals,
  createApproval,
  findApproval,
  claimApproval,
  recordDecisionAudit,
  recordExecutionAudit
};
