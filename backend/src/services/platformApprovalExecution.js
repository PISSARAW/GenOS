/**
 * Approved tool execution (point #8 — approbations).
 *
 * Runs the deferred tool action AFTER the approval row flipped to approved,
 * but only with freshly re-read payload values: the row is re-SELECTed and
 * its sha256 re-verified (TOCTOU approve→execute fix). On hash mismatch the
 * execution is cancelled, the row stays approved, a 'blocked' audit entry is
 * recorded and the caller surfaces 409 APPROVAL_PAYLOAD_TAMPERED.
 */

const policy = require('./platformApprovalPolicy');
const store = require('./platformApprovalStore');
const safety = require('./platformSafetyService');

function toolArgs(payload) {
  const source = payload || {};
  return source.args || {};
}

function toolList(payload, key) {
  const source = payload || {};
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function toolTimeoutMs(mcpExecutor, payload) {
  const source = payload || {};
  return mcpExecutor.normalizeMcpTimeout(source.timeoutMs);
}

async function auditToolExecution(db, job, execution) {
  await store.recordExecutionAudit(db, {
    actor: job.actor,
    agentId: job.approval.agent_id,
    toolName: job.toolName,
    decision: execution.success ? 'completed' : 'failed',
    reason: execution.error || execution.status,
    executionJson: JSON.stringify(execution)
  });
}

async function blockTool(db, job, error) {
  const execution = { success: false, status: 'blocked', error };
  await auditToolExecution(db, job, execution);
  return execution;
}

async function rereadVerifiedPayload(db, approval, actor) {
  const reread = await store.findApproval(db, approval.id, {
    organizationId: approval.organization_id,
    projectId: approval.project_id
  });
  const storedHash = reread ? reread.payload_hash : null;
  const payloadJson = reread ? policy.payloadText(reread.payload_json) : '{}';
  const payload = JSON.parse(payloadJson) || {};
  const toolName = policy.toolNameFromApproval(approval, payload);
  if (!policy.payloadHashMatches(storedHash, payloadJson)) {
    const execution = {
      success: false,
      status: 'blocked',
      code: 'APPROVAL_PAYLOAD_TAMPERED',
      error: 'Approval payload changed after decision; execution refused.'
    };
    await store.recordExecutionAudit(db, {
      actor,
      agentId: approval.agent_id,
      toolName,
      decision: 'blocked',
      reason: execution.error,
      executionJson: JSON.stringify(execution)
    });
    return { ok: false, execution };
  }
  return { ok: true, payload, toolName };
}

function buildToolPolicy(job) {
  return safety.validateToolCall({
    agentId: job.approval.agent_id,
    toolName: job.toolName,
    args: toolArgs(job.payload),
    permissions: policy.resolveApprovalPermissions(job.payload),
    deniedTools: toolList(job.payload, 'deniedTools'),
    taints: toolList(job.payload, 'taints')
  });
}

function toolGate(toolName) {
  const circuitBreaker = require('./circuitBreaker');
  return circuitBreaker.canExecute(toolName, 'admin');
}

async function runToolTransport(job) {
  const mcpExecutor = require('./mcpExecutor');
  return mcpExecutor.executeConfiguredTransport({
    toolName: job.toolName,
    args: toolArgs(job.payload),
    timeoutMs: toolTimeoutMs(mcpExecutor, job.payload)
  });
}

function settleToolCircuit(toolName, execution) {
  const circuitBreaker = require('./circuitBreaker');
  if (execution.success) circuitBreaker.recordSuccess(toolName);
  else if (execution.configured) circuitBreaker.recordFailure(toolName, execution.error || 'Approved MCP action failed.');
}

async function executeAllowedTool(db, job) {
  const approvalPolicy = buildToolPolicy(job);
  if (approvalPolicy.decision === 'deny') {
    const denied = { success: false, status: 'blocked', error: approvalPolicy.reason, policy: approvalPolicy };
    await auditToolExecution(db, job, denied);
    return denied;
  }
  const gate = toolGate(job.toolName);
  const execution = gate.allowed ? await runToolTransport(job) : { success: false, status: 'blocked', error: gate.message };
  settleToolCircuit(job.toolName, execution);
  await auditToolExecution(db, job, execution);
  return execution;
}

async function runVerifiedTool(db, job) {
  const tool = await db.get('SELECT name, is_locked FROM mcp_tools WHERE name = ?', job.toolName);
  if (!tool || tool.is_locked === 1) {
    return blockTool(db, job, tool ? `Tool '${job.toolName}' is persisted in quarantine.` : `Unknown MCP tool '${job.toolName}'.`);
  }
  return executeAllowedTool(db, job);
}

async function executeApprovedAction(db, approval, options) {
  if (options.status !== 'approved') return null;
  if (!policy.isToolAction(approval.action)) return null;
  const verified = await rereadVerifiedPayload(db, approval, options.actor);
  if (!verified.ok) return verified.execution;
  return runVerifiedTool(db, { approval, payload: verified.payload, toolName: verified.toolName, actor: options.actor });
}

module.exports = {
  executeApprovedAction
};
