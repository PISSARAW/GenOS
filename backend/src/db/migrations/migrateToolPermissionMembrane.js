'use strict';

async function migrateToolPermissionMembrane(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS tool_permission_receipts (
    receipt_id TEXT PRIMARY KEY, call_id TEXT NOT NULL UNIQUE, schema TEXT NOT NULL,
    tool_name TEXT NOT NULL, tool_version TEXT NOT NULL, arguments_hash TEXT NOT NULL,
    worker_id TEXT NOT NULL, worker_revision TEXT NOT NULL, lease_id TEXT NOT NULL,
    lease_hash TEXT NOT NULL,
    policy_id TEXT NOT NULL, policy_version TEXT NOT NULL, policy_decision TEXT NOT NULL,
    effective_decision TEXT NOT NULL CHECK(effective_decision IN ('deny','allow','ask','evaluate')),
    decider_type TEXT NOT NULL, decider_id TEXT NOT NULL, decision_reason TEXT NOT NULL,
    approval_id TEXT, approval_hash TEXT, authority_json TEXT NOT NULL,
    request_hash TEXT NOT NULL, authorization_hash TEXT NOT NULL,
    result_status TEXT, result_hash TEXT, result_reporter TEXT, receipt_hash TEXT NOT NULL,
    organization_id TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, settled_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_tool_permission_worker_created
    ON tool_permission_receipts(worker_id, created_at DESC);
  CREATE TRIGGER IF NOT EXISTS tool_permission_authorization_immutable
  BEFORE UPDATE ON tool_permission_receipts
  WHEN NEW.receipt_id IS NOT OLD.receipt_id OR NEW.call_id IS NOT OLD.call_id
    OR NEW.schema IS NOT OLD.schema OR NEW.tool_name IS NOT OLD.tool_name
    OR NEW.tool_version IS NOT OLD.tool_version OR NEW.arguments_hash IS NOT OLD.arguments_hash
    OR NEW.worker_id IS NOT OLD.worker_id OR NEW.worker_revision IS NOT OLD.worker_revision
    OR NEW.lease_id IS NOT OLD.lease_id OR NEW.lease_hash IS NOT OLD.lease_hash
    OR NEW.policy_id IS NOT OLD.policy_id OR NEW.policy_version IS NOT OLD.policy_version
    OR NEW.policy_decision IS NOT OLD.policy_decision
    OR NEW.effective_decision IS NOT OLD.effective_decision
    OR NEW.decider_type IS NOT OLD.decider_type OR NEW.decider_id IS NOT OLD.decider_id
    OR NEW.decision_reason IS NOT OLD.decision_reason OR NEW.approval_id IS NOT OLD.approval_id
    OR NEW.approval_hash IS NOT OLD.approval_hash OR NEW.authority_json IS NOT OLD.authority_json
    OR NEW.request_hash IS NOT OLD.request_hash OR NEW.authorization_hash IS NOT OLD.authorization_hash
    OR NEW.organization_id IS NOT OLD.organization_id OR NEW.project_id IS NOT OLD.project_id
    OR NEW.created_at IS NOT OLD.created_at
  BEGIN
    SELECT RAISE(ABORT, 'TOOL_PERMISSION_AUTHORIZATION_IMMUTABLE');
  END;
  CREATE TRIGGER IF NOT EXISTS tool_permission_receipt_no_delete
  BEFORE DELETE ON tool_permission_receipts
  BEGIN
    SELECT RAISE(ABORT, 'TOOL_PERMISSION_RECEIPT_IMMUTABLE');
  END;`);
}

module.exports = { migrateToolPermissionMembrane };
