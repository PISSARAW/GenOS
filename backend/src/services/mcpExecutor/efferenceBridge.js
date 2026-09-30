'use strict';

const { randomUUID } = require('crypto');

function toolOutcomePayload(context, result) {
  return {
    toolName: context.toolName,
    args: context.args,
    result,
    sourceActionId: context.sourceActionId || null
  };
}

async function recordToolEfference({ db, agentId, toolName, actionId }) {
  if (!agentId) return;
  try {
    await require('../efferenceCopyService').predict(db, agentId, {
      actionId,
      action: `mcp:${toolName}`,
      tool: toolName,
      expectedTypes: ['WORKFLOW_MCP_TOOL_COMPLETED', 'WORKFLOW_MCP_TOOL_FAILED']
    });
  } catch (_) {}
}

async function runToolExecution({ context, executeConfiguredTransport, applyDomainVerdict, circuitBreaker, telemetry }) {
  const actionId = context.actionId || randomUUID();
  context = { ...context, actionId, sourceActionId: actionId };
  const { agentId, toolName, args, circuitScope } = context;
  await recordToolEfference({ db: context.db, agentId, toolName, actionId });
  try {
    const result = await executeConfiguredTransport({ toolName, args });
    applyDomainVerdict(toolName, result);
    if (result.success) circuitBreaker.recordSuccess(toolName, circuitScope);
    else if (result.configured) circuitBreaker.recordFailure(toolName, result.error || `MCP tool '${toolName}' failed.`, circuitScope);
    telemetry.emitEvent({ eventType: result.success ? 'WORKFLOW_MCP_TOOL_COMPLETED' : 'WORKFLOW_MCP_TOOL_FAILED', agentId, action: 'MCP_EXECUTE', detail: `MCP tool '${toolName}' ${result.status}.`, severity: result.success ? 'info' : 'warning', payload: toolOutcomePayload(context, result) });
    return result;
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message, circuitScope);
    telemetry.emitEvent({ eventType: 'WORKFLOW_MCP_TOOL_FAILED', agentId, action: 'MCP_EXECUTE', detail: error.message, severity: 'warning', payload: toolOutcomePayload(context, { error: error.message }) });
    return { success: false, status: 'failed', error: error.message };
  }
}

module.exports = { recordToolEfference, runToolExecution, toolOutcomePayload };
