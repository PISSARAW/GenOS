'use strict';

const { randomUUID } = require('node:crypto');
const membrane = require('../toolPermissionMembraneService');
const adapters = require('../toolPermissionMembraneAdapters');
const { MCP_CONTRACT_VERSION } = require('../mcpContract');
const { directToolLeaseAllows } = require('./config');

function executionLease(request, binding) {
  const normalized = require('../toolLeasePolicy').normalizeToolName(request.toolName);
  const sealed = binding?.status === 'authorized' ? binding.envelope.toolLease : [normalized];
  const tools = sealed.filter((tool) => directToolLeaseAllows(tool));
  const identity = binding?.status === 'authorized'
    ? `execution-authority:${binding.envelope.runId}:${binding.hash}`
    : `runtime-lease:${membrane.digest({ tool: normalized, allowed: tools.includes(normalized) })}`;
  return adapters.leaseContract(identity, tools);
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

function permissionInput(context) {
  const { request, policy, binding } = context;
  return {
    callId: request.callId || `mcp-call-${randomUUID()}`,
    tool: { name: request.toolName, version: request.toolVersion || MCP_CONTRACT_VERSION },
    arguments: request.args || {},
    worker: { id: request.agentId || 'system', revision: workerRevision(request, binding) },
    lease: executionLease(request, binding),
    policy: adapters.platformSafetyPolicy(policy, { id: 'platform-safety', version: 'runtime-v1' }),
    authorityChecks: authorityChecks(request, binding),
    approval: approval(request),
    evaluation: request.evaluation || null,
    organizationId: request.organizationId || '',
    projectId: request.projectId || ''
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
  return membrane.settleToolCall(context.db, {
    receiptId: authorization.receiptId,
    status: 'failed',
    result: { code: error.code || 'MCP_EXECUTION_FAILED', message: error.message },
    reporterId: 'mcp-executor'
  });
}

async function executeAuthorized(context) {
  const authorization = await membrane.authorizeToolCall(context.db, permissionInput(context));
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
  return withReceipt(result, receipt);
}

module.exports = { executeAuthorized, permissionInput };
