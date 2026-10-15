'use strict';

const crypto = require('crypto');
const { canonicalize } = require('./evaluationGraders');
const { normalizeToolName } = require('./toolLeasePolicy');
const { migrateToolPermissionMembrane } = require('../db/migrations/migrateToolPermissionMembrane');

const DECISIONS = Object.freeze(['deny', 'allow', 'ask', 'evaluate']);
const AUTHORITY_DECISIONS = Object.freeze(['deny', 'allow']);
const RECEIPT_SCHEMA = 'genos.tool-permission-receipt/v1';
const HEX_64 = /^[a-f0-9]{64}$/i;

function text(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw membraneError('TOOL_MEMBRANE_INPUT_INVALID', `${field} is required.`);
  return normalized;
}

function membraneError(code, message) {
  return Object.assign(new Error(message), { code });
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function normalizePolicy(policy) {
  const source = policy || {};
  const decision = String(source.decision || '').trim().toLowerCase();
  if (!DECISIONS.includes(decision)) {
    throw membraneError('TOOL_MEMBRANE_POLICY_INVALID', `policy.decision must be one of: ${DECISIONS.join(', ')}.`);
  }
  return {
    id: text(source.id, 'policy.id'), version: text(source.version, 'policy.version'), decision,
    reason: textOrEmpty(source.reason) || null
  };
}

function normalizeTool(tool) {
  const source = tool || {};
  const name = normalizeToolName(source.name);
  if (!name) throw membraneError('TOOL_MEMBRANE_INPUT_INVALID', 'tool.name is required.');
  return { name, version: text(source.version, 'tool.version') };
}

function normalizeWorker(worker) {
  const source = worker || {};
  return { id: text(source.id, 'worker.id'), revision: text(source.revision, 'worker.revision') };
}

function normalizeLease(lease) {
  const source = lease || {};
  const tools = Array.isArray(source.tools) ? source.tools.map(normalizeToolName).filter(Boolean) : [];
  return { id: text(source.id, 'lease.id'), tools: [...new Set(tools)] };
}

function normalizeAuthorityChecks(checks) {
  if (!Array.isArray(checks)) return [];
  return checks.map((entry) => ({
    source: typeof entry?.source === 'string' ? entry.source.trim() : '',
    decision: typeof entry?.decision === 'string' ? entry.decision.trim().toLowerCase() : '',
    deciderId: typeof entry?.deciderId === 'string' ? entry.deciderId.trim() : '',
    reason: typeof entry?.reason === 'string' ? entry.reason.trim() : null
  }));
}

function requestMaterial(input) {
  const tool = normalizeTool(input.tool);
  const worker = normalizeWorker(input.worker);
  const lease = normalizeLease(input.lease);
  const policy = normalizePolicy(input.policy);
  const argumentsHash = digest(input.arguments ?? {});
  return {
    callId: text(input.callId, 'callId'), tool, worker, lease, policy, argumentsHash,
    organizationId: input.organizationId || '', projectId: input.projectId || ''
  };
}

function callRequestHash(material) {
  return digest(material);
}

function toolCallBindingHash(input) {
  return callRequestHash(requestMaterial(input || {}));
}

function invalidAuthority(checks) {
  return checks.find((entry) => !entry.source || !entry.deciderId
    || !AUTHORITY_DECISIONS.includes(entry.decision));
}

function authorityVerdict(checks) {
  if (!checks.length) return { decision: 'deny', type: 'authority', id: 'membrane', reason: 'authority_unverified' };
  if (invalidAuthority(checks)) return { decision: 'deny', type: 'authority', id: 'membrane', reason: 'authority_check_invalid' };
  const denied = checks.find((entry) => entry.decision === 'deny');
  if (denied) return { decision: 'deny', type: denied.source, id: denied.deciderId, reason: denied.reason || 'authority_denied' };
  return null;
}

function approvalVerdict(input, material, requestHash) {
  const approval = input.approval;
  if (!approval || approval.status === 'pending') {
    return { decision: 'ask', type: 'policy', id: material.policy.id, reason: 'approval_required' };
  }
  if (approval.status === 'rejected') {
    return { decision: 'deny', type: 'approval', id: approval.deciderId || 'unknown', reason: 'approval_rejected' };
  }
  if (!approvalIsBound(approval, material, requestHash)) {
    return { decision: 'deny', type: 'approval', id: 'membrane', reason: 'approval_invalid_or_unbound' };
  }
  return { decision: 'allow', type: 'approval', id: approval.deciderId, reason: 'approval_verified' };
}

function approvalIsBound(approval, material, requestHash) {
  return approval.status === 'approved' && textOrEmpty(approval.id)
    && textOrEmpty(approval.deciderId) && approval.deciderId !== material.worker.id
    && approval.bindingHash === requestHash && HEX_64.test(String(approval.payloadHash || ''));
}

function evaluationVerdict(input, material, requestHash) {
  const evaluation = input.evaluation;
  if (!evaluation) return { decision: 'evaluate', type: 'policy', id: material.policy.id, reason: 'evaluation_required' };
  const decision = String(evaluation.decision || '').toLowerCase();
  const valid = AUTHORITY_DECISIONS.includes(decision) && textOrEmpty(evaluation.evaluatorId)
    && evaluation.bindingHash === requestHash && HEX_64.test(String(evaluation.evidenceHash || ''));
  if (!valid) return { decision: 'deny', type: 'evaluator', id: 'membrane', reason: 'evaluation_invalid_or_unbound' };
  return { decision, type: 'evaluator', id: evaluation.evaluatorId, reason: evaluation.reason || 'evaluation_verified' };
}

function textOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function policyVerdict(input, material, requestHash) {
  if (material.policy.decision === 'deny') {
    return { decision: 'deny', type: 'policy', id: material.policy.id, reason: material.policy.reason || 'policy_denied' };
  }
  if (material.policy.decision === 'allow') {
    return { decision: 'allow', type: 'policy', id: material.policy.id, reason: material.policy.reason || 'policy_allowed' };
  }
  if (material.policy.decision === 'ask') return approvalVerdict(input, material, requestHash);
  return evaluationVerdict(input, material, requestHash);
}

function resolveVerdict(input, material, requestHash) {
  const checks = normalizeAuthorityChecks(input.authorityChecks);
  const authority = authorityVerdict(checks);
  if (authority) return { verdict: authority, checks };
  if (!material.lease.tools.includes(material.tool.name)) {
    return { verdict: { decision: 'deny', type: 'lease', id: material.lease.id, reason: 'tool_outside_lease' }, checks };
  }
  return { verdict: policyVerdict(input, material, requestHash), checks };
}

function receiptId() {
  return `tool-permission-${crypto.randomUUID()}`;
}

function authorizationMaterial({ material, resolution, requestHash, input }) {
  return {
    schema: RECEIPT_SCHEMA, requestHash, callId: material.callId, tool: material.tool,
    argumentsHash: material.argumentsHash, worker: material.worker, leaseId: material.lease.id,
    leaseHash: digest(material.lease.tools),
    policy: material.policy, authorityChecks: resolution.checks,
    effectiveDecision: resolution.verdict.decision, deciderType: resolution.verdict.type,
    deciderId: resolution.verdict.id, reason: resolution.verdict.reason,
    approvalId: input.approval?.id || null, approvalHash: input.approval?.payloadHash || null,
    organizationId: material.organizationId, projectId: material.projectId
  };
}

function rowValues({ receipt, material, resolution, authorization, requestHash }) {
  const verdict = resolution.verdict;
  return [receipt, material.callId, RECEIPT_SCHEMA, material.tool.name, material.tool.version,
    material.argumentsHash, material.worker.id, material.worker.revision, material.lease.id,
    authorization.leaseHash,
    material.policy.id, material.policy.version, material.policy.decision, verdict.decision,
    verdict.type, verdict.id, verdict.reason, authorization.approvalId, authorization.approvalHash,
    canonicalJson(resolution.checks), requestHash, digest(authorization), digest(authorization),
    material.organizationId, material.projectId];
}

async function storedCall(db, callId) {
  return db.get('SELECT * FROM tool_permission_receipts WHERE call_id = ?', callId);
}

function present(row, replayed = false) {
  return {
    receiptId: row.receipt_id, callId: row.call_id, decision: row.effective_decision,
    executable: row.effective_decision === 'allow', reason: row.decision_reason,
    requestHash: row.request_hash, authorizationHash: row.authorization_hash,
    resultStatus: row.result_status, resultHash: row.result_hash,
    receiptHash: row.receipt_hash, replayed
  };
}

async function authorizeToolCall(db, input) {
  await migrateToolPermissionMembrane(db);
  const material = requestMaterial(input || {});
  const requestHash = callRequestHash(material);
  const existing = await storedCall(db, material.callId);
  if (existing && existing.request_hash !== requestHash) {
    throw membraneError('TOOL_MEMBRANE_CALL_CONFLICT', `callId '${material.callId}' is already bound to another request.`);
  }
  if (existing) return present(existing, true);
  const resolution = resolveVerdict(input, material, requestHash);
  const authorization = authorizationMaterial({ material, resolution, requestHash, input });
  const id = receiptId();
  await db.run(`INSERT INTO tool_permission_receipts (
    receipt_id,call_id,schema,tool_name,tool_version,arguments_hash,worker_id,worker_revision,
    lease_id,lease_hash,policy_id,policy_version,policy_decision,effective_decision,decider_type,decider_id,
    decision_reason,approval_id,approval_hash,authority_json,request_hash,authorization_hash,
    receipt_hash,organization_id,project_id) VALUES (${Array(25).fill('?').join(',')})`,
  ...rowValues({ receipt: id, material, resolution, authorization, requestHash }));
  return present(await storedCall(db, material.callId));
}

async function settleToolCall(db, input) {
  await migrateToolPermissionMembrane(db);
  const receipt = await loadAuthorizedReceipt(db, input);
  const result = settlementInput(input);
  assertOriginalResultCompatible(receipt, result);
  await writeResultIfAbsent(db, receipt, result);
  const settled = await db.get('SELECT * FROM tool_permission_receipts WHERE receipt_id = ?', receipt.receipt_id);
  assertSettledResult(settled, result);
  return present(settled, Boolean(receipt.result_hash));
}

function settlementInput(input) {
  return {
    status: text(input?.status, 'status'),
    resultHash: digest(input?.result ?? null),
    reporter: text(input?.reporterId, 'reporterId')
  };
}

function sameResult(receipt, result) {
  return receipt.result_hash === result.resultHash && receipt.result_status === result.status
    && receipt.result_reporter === result.reporter;
}

function assertOriginalResultCompatible(receipt, result) {
  if (!receipt.result_hash || sameResult(receipt, result)) return;
  throw membraneError('TOOL_MEMBRANE_RESULT_CONFLICT', 'This tool call already has a different result.');
}

async function writeResultIfAbsent(db, receipt, result) {
  if (receipt.result_hash) return;
  const finalHash = digest({ authorizationHash: receipt.authorization_hash,
    status: result.status, resultHash: result.resultHash, reporter: result.reporter });
  await db.run(`UPDATE tool_permission_receipts SET result_status=?, result_hash=?,
    result_reporter=?, receipt_hash=?, settled_at=CURRENT_TIMESTAMP
    WHERE receipt_id=? AND result_hash IS NULL`, result.status, result.resultHash,
  result.reporter, finalHash, receipt.receipt_id);
}

async function loadAuthorizedReceipt(db, input) {
  const receipt = await db.get('SELECT * FROM tool_permission_receipts WHERE receipt_id = ?', text(input?.receiptId, 'receiptId'));
  if (!receipt) throw membraneError('TOOL_MEMBRANE_RECEIPT_NOT_FOUND', 'Tool permission receipt was not found.');
  if (receipt.effective_decision !== 'allow') {
    throw membraneError('TOOL_MEMBRANE_NOT_AUTHORIZED', 'Only an allowed tool call can record an execution result.');
  }
  return receipt;
}

function assertSettledResult(settled, result) {
  if (!sameResult(settled, result)) {
    throw membraneError('TOOL_MEMBRANE_RESULT_CONFLICT', 'Another result settled this tool call first.');
  }
}

module.exports = {
  DECISIONS,
  RECEIPT_SCHEMA,
  authorizeToolCall,
  settleToolCall,
  toolCallBindingHash,
  digest
};
