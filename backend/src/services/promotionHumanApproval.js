'use strict';

function nonBlank(value) { return typeof value === 'string' && value.trim().length > 0; }

function validReceiptFields(approval) {
  if (!approval || typeof approval !== 'object') return false;
  if (approval.approved !== true) return false;
  if (!nonBlank(approval.approvalId) || !nonBlank(approval.approverId)) return false;
  if (!nonBlank(approval.approvedAt) || !Number.isFinite(Date.parse(approval.approvedAt))) return false;
  return typeof approval.payloadHash === 'string' && /^[a-f0-9]{64}$/i.test(approval.payloadHash);
}

function digestMatches(approval, executionContext) {
  return nonBlank(executionContext.approvalDigest)
    && approval.payloadHash.toLowerCase() === executionContext.approvalDigest.toLowerCase();
}

function isValidHumanApproval(approval, executionContext) {
  return validReceiptFields(approval) && digestMatches(approval, executionContext);
}

function buildApprovalViolation(policy, executionContext) {
  if (!policy.require_human_approval) return null;
  if (isValidHumanApproval(executionContext.humanApprovalReceipt, executionContext)) return null;
  return { policy: 'require_human_approval', message: 'Contract requires a durable, hash-bound human approval receipt before promotion.' };
}

module.exports = { buildApprovalViolation };
