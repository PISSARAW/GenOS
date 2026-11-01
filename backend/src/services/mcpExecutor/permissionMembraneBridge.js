'use strict';

const { randomUUID } = require('node:crypto');
const membrane = require('../toolPermissionMembraneService');
const adapters = require('../toolPermissionMembraneAdapters');
const { MCP_CONTRACT_VERSION } = require('../mcpContract');
const { directToolLeaseAllows, directToolGloballyEnabled, scopedWorkerReplayLeaseOpen } = require('./config');
const { migratePermissionReceiptLineage } = require('../../db/migrations/migratePermissionReceiptLineage');

const LINEAGE_SCHEMA = 'genos.permission-receipt-lineage/v1';

function lineageError(code, message) {
  return Object.assign(new Error(message), { code });
}

function authorityIdentity(request, binding) {
  if (binding?.status !== 'authorized') return null;
  const envelope = binding.envelope || {};
  const identity = {
    missionId: envelope.missionId,
    organizationId: envelope.scope?.organizationId,
    projectId: envelope.scope?.projectId,
    workerId: envelope.scope?.entityId
  };
  if (Object.values(identity).some((value) => typeof value !== 'string' || !value.trim())) {
    throw lineageError('TOOL_MEMBRANE_LINEAGE_AUTHORITY_INVALID',
      'The execution authority envelope cannot issue a receipt lineage.');
  }
  if (identity.workerId !== request.agentId) {
    throw lineageError('TOOL_MEMBRANE_LINEAGE_WORKER_COLLISION',
      'The execution authority belongs to another worker.');
  }
  for (const field of ['missionId', 'organizationId', 'projectId']) {
    if (request[field] && request[field] !== identity[field]) {
      throw lineageError('TOOL_MEMBRANE_LINEAGE_SCOPE_COLLISION',
        `The requested ${field} conflicts with backend execution authority.`);
    }
  }
  return identity;
}

async function authorityThread(db, request, identity) {
  const selectors = [identity.missionId, identity.organizationId,
    identity.projectId, identity.workerId];
  let sql = `SELECT * FROM cell_threads WHERE mission_id = ?
    AND organization_id = ? AND project_id = ? AND worker_id = ?`;
  if (request.threadId) { sql += ' AND thread_id = ?'; selectors.push(request.threadId); }
  if (request.episodeId) { sql += ' AND episode_id = ?'; selectors.push(request.episodeId); }
  const rows = await db.all(`${sql} ORDER BY created_at DESC, thread_id LIMIT 2`, ...selectors);
  if (!rows.length && (request.threadId || request.episodeId)) {
    throw lineageError('TOOL_MEMBRANE_LINEAGE_THREAD_COLLISION',
      'The selected cell thread does not belong to backend execution authority.');
  }
  if (rows.length > 1) {
    throw lineageError('TOOL_MEMBRANE_LINEAGE_AMBIGUOUS',
      'Several cell threads match this worker; an exact backend thread is required.');
  }
  return rows[0] || null;
}

function lineageMaterial(receipt, thread) {
  return {
    schema: LINEAGE_SCHEMA, receiptId: receipt.receipt_id,
    authorizationHash: receipt.authorization_hash,
    missionId: thread.mission_id, episodeId: thread.episode_id,
    threadId: thread.thread_id, workerId: thread.worker_id,
    organizationId: thread.organization_id, projectId: thread.project_id
  };
}

function sameLineage(row, material) {
  return row.mission_id === material.missionId && row.episode_id === material.episodeId
    && row.thread_id === material.threadId && row.worker_id === material.workerId
    && row.organization_id === material.organizationId
    && row.project_id === material.projectId
    && row.authorization_hash === material.authorizationHash
    && row.lineage_hash === membrane.digest(material);
}

async function persistLineage(db, input) {
  const { authorization, resolved } = input;
  if (!resolved) return { exact: false, reason: 'execution_authority_unbound' };
  if (!resolved.thread) return { exact: false, reason: 'cell_thread_unavailable' };
  const { identity, thread } = resolved;
  const receipt = await db.get('SELECT * FROM tool_permission_receipts WHERE receipt_id = ?',
    authorization.receiptId);
  if (!receipt || receipt.worker_id !== identity.workerId) {
    throw lineageError('TOOL_MEMBRANE_LINEAGE_RECEIPT_COLLISION',
      'The permission receipt belongs to another worker.');
  }
  const material = lineageMaterial(receipt, thread);
  const existing = await db.get(`SELECT * FROM tool_permission_receipt_lineage
    WHERE receipt_id = ?`, receipt.receipt_id);
  if (existing && !sameLineage(existing, material)) {
    throw lineageError('TOOL_MEMBRANE_LINEAGE_RECEIPT_COLLISION',
      'The permission receipt already has another backend lineage.');
  }
  if (!existing) {
    await db.run(`INSERT INTO tool_permission_receipt_lineage
      (receipt_id, mission_id, episode_id, thread_id, organization_id, project_id,
        worker_id, authorization_hash, lineage_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, receipt.receipt_id, material.missionId,
    material.episodeId, material.threadId, material.organizationId, material.projectId,
    material.workerId, material.authorizationHash, membrane.digest(material));
  }
  return { exact: true, missionId: material.missionId,
    episodeId: material.episodeId, threadId: material.threadId };
}

async function resolveLineage(db, request, binding) {
  const identity = authorityIdentity(request, binding);
  if (!identity) return null;
  await migratePermissionReceiptLineage(db);
  return { identity, thread: await authorityThread(db, request, identity) };
}

function sealedTools(binding, normalized) {
  return binding?.status === 'authorized' ? binding.envelope.toolLease : [normalized];
}

function filterAllowedTools(binding, sealed) {
  if (binding?.status === 'authorized') {
    return sealed.filter((tool) => tool !== 'genos_replay' && directToolGloballyEnabled(tool));
  }
  return sealed.filter((tool) => directToolLeaseAllows(tool));
}

async function attachReplayIfAllowed(input, tools) {
  const { db, request, options } = input;
  const replaySnapshot = request.args?.snapshot || request.args?.snapshot_id;
  if (!require('./permissionMembraneBridgeValues1.js').executionLeaseValue1(options)) return;
  if (db && !await require('../agents/workerContractEnforcement').ownsReplaySnapshot({
    db, agentId: request.agentId, reference: replaySnapshot, suppliedRoot: request.args?.root ?? null
  })) return;
  if (!tools.includes('genos_replay')) tools.push('genos_replay');
}

function leaseIdentity(binding, normalized, allowed) {
  if (binding?.status === 'authorized') {
    return `execution-authority:${binding.envelope.runId}:${binding.hash}`;
  }
  return `runtime-lease:${membrane.digest({ tool: normalized, allowed })}`;
}

async function executionLease(db, request, binding) {
  const normalized = require('../toolLeasePolicy').normalizeToolName(request.toolName);
  const sealed = sealedTools(binding, normalized);
  const tools = filterAllowedTools(binding, sealed);
  const options = { binding, directToolGloballyEnabled, normalized, scopedWorkerReplayLeaseOpen, sealed };
  await attachReplayIfAllowed({ db, request, options }, tools);
  const identity = leaseIdentity(binding, normalized, tools.includes(normalized));
  return adapters.leaseContract(identity, tools);
}

async function scopedReplayAuthorized(db, request, binding) {
  const normalized = require('../toolLeasePolicy').normalizeToolName(request.toolName);
  const sealed = binding?.status === 'authorized' ? binding.envelope.toolLease : [];
  const snapshot = request.args?.snapshot || request.args?.snapshot_id;
  return normalized === 'genos_replay' && sealed.includes('genos_replay')
    && scopedWorkerReplayLeaseOpen()
    && await require('../agents/workerContractEnforcement').ownsReplaySnapshot({ db: db, agentId: request.agentId, reference: snapshot, suppliedRoot: request.args?.root ?? null });
}

function workerRevision(request, binding) {
  if (binding?.status === 'authorized') return binding.hash;
  return String(request.workerRevision || request.runId || 'runtime-current');
}

function authorityChecks(request, binding) {
  if (binding?.status === 'denied') {
    return [{
      source: 'execution-authority-envelope', decision: 'deny',
      deciderId: 'mission-envelope-authority', reason: binding.reason
    }];
  }
  const bound = binding?.status === 'authorized';
  return [{
    source: bound ? 'execution-authority-envelope' : 'mission-execution-authority',
    decision: 'allow',
    deciderId: bound ? binding.envelope.runId : 'mcp-executor',
    reason: bound ? 'sealed_authority_current' : request.agentId ? 'agent_authority_current' : 'system_authority'
  }];
}

function approval(request) {
  const candidate = request.approval;
  if (!candidate) return null;
  if (candidate.bindingHash && candidate.deciderId) return candidate;
  return adapters.platformApproval(candidate);
}

async function permissionInput(context) {
  const { request, policy, binding } = context;
  const authority = authorityIdentity(request, binding);
  return {
    callId: request.callId || `mcp-call-${randomUUID()}`,
    tool: { name: request.toolName, version: request.toolVersion || MCP_CONTRACT_VERSION },
    arguments: request.args || {},
    worker: { id: request.agentId || 'system', revision: workerRevision(request, binding) },
    lease: await executionLease(context.db, request, binding),
    policy: adapters.platformSafetyPolicy(policy, { id: 'platform-safety', version: 'runtime-v1' }),
    authorityChecks: authorityChecks(request, binding),
    approval: approval(request),
    evaluation: request.evaluation || null,
    organizationId: authority?.organizationId || request.organizationId || '',
    projectId: authority?.projectId || request.projectId || ''
  };
}

function refusal(authorization, policy) {
  const waiting = authorization.decision === 'ask' || authorization.decision === 'evaluate';
  return {
    success: false,
    status: waiting ? 'approval_required' : 'deny',
    policy,
    permissionReceipt: authorization
  };
}

function resultStatus(result) {
  if (typeof result?.status === 'string' && result.status.trim()) return result.status;
  return result?.success === true ? 'completed' : 'failed';
}

function withReceipt(result, receipt) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { success: false, status: 'failed', output: result, permissionReceipt: receipt };
  }
  return { ...result, permissionReceipt: receipt };
}

async function settleFailure(context, authorization, error) {
  const receipt = await membrane.settleToolCall(context.db, {
    receiptId: authorization.receiptId,
    status: 'failed',
    result: { code: error.code || 'MCP_EXECUTION_FAILED', message: error.message },
    reporterId: 'mcp-executor'
  });
  receipt.lineage = authorization.lineage;
  return receipt;
}

async function executeAuthorized(context) {
  const resolved = await resolveLineage(context.db, context.request, context.binding);
  const authorization = await membrane.authorizeToolCall(context.db, await permissionInput(context));
  const lineage = await persistLineage(context.db, {
    authorization, resolved
  });
  authorization.lineage = lineage;
  if (!authorization.executable) return refusal(authorization, context.policy);
  let result;
  try {
    result = await context.operation();
  } catch (error) {
    const receipt = await settleFailure(context, authorization, error);
    error.permissionReceipt = receipt;
    throw error;
  }
  const receipt = await membrane.settleToolCall(context.db, {
    receiptId: authorization.receiptId,
    status: resultStatus(result),
    result,
    reporterId: 'mcp-executor'
  });
  receipt.lineage = lineage;
  return withReceipt(result, receipt);
}

module.exports = { executeAuthorized, permissionInput, persistLineage, scopedReplayAuthorized, LINEAGE_SCHEMA };
