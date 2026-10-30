'use strict';

const circuitBreaker = require('./circuitBreaker');
const telemetry = require('./telemetryObserver');
const mcpExecutor = require('./mcpExecutor');

function recordToolOutcome(toolName, result) {
  if (result.success) {
    circuitBreaker.recordSuccess(toolName);
    return;
  }
  if (result.configured) circuitBreaker.recordFailure(toolName,
    result.error || `MCP tool '${toolName}' failed.`);
}

function toolOutcomeEvent({ toolName, args, agentId, result }) {
  const detail = result.success ? `Executed '${toolName}' over ${result.transport}.`
    : (result.error || `MCP tool '${toolName}' failed.`);
  return { eventType: result.success ? 'MCP_TOOL_EXECUTED' : 'MCP_TOOL_EXECUTION_FAILED',
    agentId, action: 'MCP_EXECUTE', detail, severity: result.success ? 'info' : 'warning',
    payload: { toolName, args, result } };
}

async function executeToolTransport({ res, toolName, args, timeoutMs, agentId, tenant }) {
  try {
    const result = await mcpExecutor.executeConfiguredTransport({ toolName, args,
      agentId, tenant, timeoutMs: mcpExecutor.normalizeMcpTimeout(timeoutMs) });
    recordToolOutcome(toolName, result);
    telemetry.emitEvent(toolOutcomeEvent({ toolName, args, agentId, result }));
    return res.status(result.success ? 200 : result.configured ? 502 : 503).json(result);
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message);
    return res.status(502).json({ error: { code: error.code || 'MCP_TOOL_ERROR',
      message: error.message } });
  }
}

async function executeTestTransport({ res, toolName, args, timeoutMs, agentId, tenant }) {
  try {
    const result = await mcpExecutor.executeConfiguredTransport({ toolName, args, agentId,
      tenant, timeoutMs: mcpExecutor.normalizeMcpTimeout(timeoutMs, 15000) });
    if (result.success) circuitBreaker.recordSuccess(toolName);
    else if (result.configured) circuitBreaker.recordFailure(toolName,
      result.error || 'MCP test failed.');
    return res.status(result.success ? 200 : result.configured ? 502 : 503).json(result);
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message);
    return res.status(502).json({ error: { code: error.code || 'MCP_TOOL_ERROR',
      message: error.message } });
  }
}

function header(req, name) {
  return req.get?.(name) || req.headers?.[name.toLowerCase()];
}

async function resolveMissionActorAuthorization({ req, db, toolName, args }) {
  const actorToken = header(req, 'X-GenOS-MCP-Actor-Token');
  if (!actorToken) return null;
  try {
    const capability = await require('./mcpActorCapability').verifyFromToken(db,
      { token: actorToken, toolName });
    const bound = await require('./missionEnvelopeAuthority').assertRun(db, {
      agentId: capability.agent_id, runId: capability.run_id
    });
    const scope = req.tenant || null;
    if (require('./mcpControllerExecutionValues1.js').resolveMissionActorAuthorizationValue1({ bound, scope })) {
      throw Object.assign(new Error('MCP actor lease does not match the authenticated tenant.'),
        { code: 'MCP_ACTOR_TENANT_MISMATCH' });
    }
    await require('./agents/workerContractEnforcement').enforcePersistedWorkerTool(db,
      capability.agent_id, { toolName, args });
    const permissionRow = scope ? await db.get(`SELECT * FROM agent_permissions
      WHERE agent_id = ? AND organization_id = ? AND project_id = ?`, capability.agent_id,
    scope.organizationId, scope.projectId) : null;
    const deniedTools = JSON.parse(permissionRow?.denied_tools_json || '[]');
    const zeroTrust = require('./platformSafetyService').validateToolCall({
      agentId: capability.agent_id, toolName, args, permissions: [toolName], deniedTools,
      taints: req.body?.taints || []
    });
    return { agentId: capability.agent_id, runId: capability.run_id,
      zeroTrust, deniedTools, actorToken };
  } catch (error) {
    return { error: { status: 403, code: error.code || 'MCP_ACTOR_AUTHORITY_DENIED',
      message: error.message } };
  }
}

async function executeMissionActorTool(input) {
  const { req, db, toolName, args, agentId, runId, actorToken } = input;
  let receipt = null;
  try {
    const actor = require('./mcpActorCapability');
    receipt = await actor.beginFromToken(db, { token: actorToken, toolName });
    const scope = req.tenant || null;
    const result = await mcpExecutor.execute({ agentId, runId,
      organizationId: scope?.organizationId, projectId: scope?.projectId, toolName, args,
      taints: req.body?.taints || [] });
    await actor.finishFromToken(db, { token: actorToken, toolName,
      actionId: receipt.actionId, success: result?.success === true,
      outputHash: require('./toolPermissionMembraneService').digest(result) });
    recordToolOutcome(toolName, result);
    telemetry.emitEvent(toolOutcomeEvent({ toolName, args, agentId, result }));
    return { status: result.success ? 200 : 502, body: result };
  } catch (error) {
    if (receipt) {
      try {
        await require('./mcpActorCapability').finishFromToken(db, { token: actorToken,
          toolName, actionId: receipt.actionId, success: false,
          outputHash: require('./toolPermissionMembraneService').digest({
            code: error.code || 'MCP_TOOL_ERROR', message: error.message
          }) });
      } catch (_) {}
    }
    circuitBreaker.recordFailure(toolName, error.message);
    return { status: 502, body: { error: { code: error.code || 'MCP_TOOL_ERROR',
      message: error.message } } };
  }
}

module.exports = { executeToolTransport, executeTestTransport,
  resolveMissionActorAuthorization, executeMissionActorTool };
