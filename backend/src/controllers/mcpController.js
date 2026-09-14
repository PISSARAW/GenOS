const { getDatabase } = require('../db');
const circuitBreaker = require('../services/circuitBreaker');
const telemetry = require('../services/telemetryObserver');
const platformSafety = require('../services/platformSafetyService');
const mcpExecutor = require('../services/mcpExecutor');
const vfsSandboxService = require('../services/vfsSandboxService');
const { MCP_CONTRACT_VERSION, getToolInputSchema, getFullToolSchema, normalizeMcpEnvelope } = require('../services/mcpContract');

function requestUser(req) {
  return req.user || {};
}

function requestRole(req) {
  return requestUser(req).role || 'viewer';
}

function actorName(req) {
  const user = requestUser(req);
  return user.keyId || user.username || 'anonymous';
}

function mcpError(res, options) {
  const { status, code, message, details } = options;
  const payload = { error: { code, message } };
  if (details) payload.error.details = details;
  return res.status(status).json(payload);
}

function parseArray(raw) {
  return JSON.parse(raw || '[]');
}

function hasSafePermission(user) {
  const permissions = user.permissions || [];
  return permissions.includes('mcp:execute_safe');
}

function permissionSet(user, permissionRow) {
  if (user.role === 'admin') return ['*'];
  if (hasSafePermission(user)) return ['tool:execute'];
  if (!permissionRow) return [];
  return parseArray(permissionRow.permissions_json);
}

function deniedToolList(permissionRow) {
  if (!permissionRow) return [];
  return parseArray(permissionRow.denied_tools_json);
}

async function loadPermissionRow(db, req, agentId) {
  return db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id = ? AND project_id = ?', agentId, req.tenant.organizationId, req.tenant.projectId);
}

function isForbiddenAgentId(requestedId, authenticatedId, user) {
  if (!requestedId || requestedId === authenticatedId) return false;
  if (user.role === 'admin') return false;
  const permissions = user.permissions || [];
  return !permissions.includes('all');
}

function resolveAgentId(req) {
  const user = requestUser(req);
  const authenticatedId = user.username || user.keyId || 'mcp_controller';
  const requestedId = String((req.body || {}).agentId || '').trim();
  if (isForbiddenAgentId(requestedId, authenticatedId, user)) {
    const error = new Error('agentId must match the authenticated principal.');
    error.status = 403;
    throw error;
  }
  return requestedId || authenticatedId;
}

function resolveAgentIdOrError(req) {
  try {
    return { agentId: resolveAgentId(req) };
  } catch (error) {
    return {
      error: {
        status: error.status || 403,
        code: error.code || 'AGENT_ID_FORBIDDEN',
        message: error.message
      }
    };
  }
}

function circuitGate() {
  circuitBreaker.refreshPersistedHalt();
  if (circuitBreaker.isHalted) {
    return { status: 503, code: 'SYSTEM_HALTED', message: `Execution blocked. System is halted: ${circuitBreaker.haltReason}` };
  }
  if (circuitBreaker.state === 'OPEN') {
    return { status: 503, code: 'CIRCUIT_OPEN', message: 'Execution blocked while the global circuit breaker is open.' };
  }
  return null;
}

function evaluatePolicy(input) {
  const { agentId, toolName, args, permissions, deniedTools, taints } = input;
  const policy = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints });
  if (policy.decision === 'allow') return { policy };
  if (policy.decision === 'approval_required') {
    return { policy, error: { status: 202, code: 'APPROVAL_REQUIRED', message: policy.reason, details: policy } };
  }
  return { policy, error: { status: 403, code: 'ZERO_TRUST_DENIED', message: policy.reason, details: policy } };
}

async function authorizeRequest(input) {
  const { req, db, toolName, args } = input;
  const identity = resolveAgentIdOrError(req);
  if (identity.error) return { error: identity.error };
  const haltError = circuitGate();
  if (haltError) return { error: haltError };
  const permissionRow = await loadPermissionRow(db, req, identity.agentId);
  const user = requestUser(req);
  const policy = evaluatePolicy({
    agentId: identity.agentId,
    toolName,
    args,
    permissions: permissionSet(user, permissionRow),
    deniedTools: deniedToolList(permissionRow),
    taints: req.body.taints || []
  });
  if (policy.error) return { error: policy.error };
  return { agentId: identity.agentId };
}

async function resolveToolAuthorization(input) {
  const { req, db, toolName, args } = input;
  const identity = resolveAgentIdOrError(req);
  if (identity.error) return { error: identity.error };
  const permissionRow = await loadPermissionRow(db, req, identity.agentId);
  const user = requestUser(req);
  const permissions = permissionSet(user, permissionRow);
  const deniedTools = deniedToolList(permissionRow);
  const zeroTrust = platformSafety.validateToolCall({
    agentId: identity.agentId,
    toolName,
    args,
    permissions,
    deniedTools,
    taints: req.body.taints || []
  });
  return { agentId: identity.agentId, zeroTrust, deniedTools };
}

async function auditToolCall(input) {
  const { db, req, agentId, toolName, zeroTrust } = input;
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json,organization_id,project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', actorName(req), agentId, 'TOOL_CALL', toolName, zeroTrust.decision, zeroTrust.reason, JSON.stringify(zeroTrust), req.tenant.organizationId, req.tenant.projectId);
}

async function requestApproval(input) {
  const { db, req, agentId, toolName, args, deniedTools } = input;
  const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.run('INSERT INTO platform_approvals (id, action, agent_id, risk, uncertainty, requested_by, organization_id, project_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', approvalId, `tool:${toolName}`, agentId, 'high', 0.8, requestUser(req).username || agentId, req.tenant.organizationId, req.tenant.projectId, JSON.stringify({ toolName, args, taints: req.body.taints || [], deniedTools }));
  return approvalId;
}

function recordToolOutcome(toolName, result) {
  if (result.success) {
    circuitBreaker.recordSuccess(toolName);
    return;
  }
  if (result.configured) circuitBreaker.recordFailure(toolName, result.error || `MCP tool '${toolName}' failed.`);
}

function toolOutcomeEvent(input) {
  const { toolName, args, agentId, result } = input;
  const detail = result.success ? `Executed '${toolName}' over ${result.transport}.` : (result.error || `MCP tool '${toolName}' failed.`);
  return {
    eventType: result.success ? 'MCP_TOOL_EXECUTED' : 'MCP_TOOL_EXECUTION_FAILED',
    agentId,
    action: 'MCP_EXECUTE',
    detail,
    severity: result.success ? 'info' : 'warning',
    payload: { toolName, args, result }
  };
}

async function executeToolTransport(input) {
  const { res, toolName, args, timeoutMs, agentId } = input;
  try {
    const result = await mcpExecutor.executeConfiguredTransport({ toolName, args, timeoutMs: mcpExecutor.normalizeMcpTimeout(timeoutMs) });
    recordToolOutcome(toolName, result);
    telemetry.emitEvent(toolOutcomeEvent({ toolName, args, agentId, result }));
    return res.status(result.success ? 200 : result.configured ? 502 : 503).json(result);
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message);
    return mcpError(res, { status: 502, code: error.code || 'MCP_TOOL_ERROR', message: error.message });
  }
}

async function executeTestTransport(input) {
  const { res, toolName, args, timeoutMs } = input;
  try {
    const result = await mcpExecutor.executeConfiguredTransport({ toolName, args, timeoutMs: mcpExecutor.normalizeMcpTimeout(timeoutMs, 15000) });
    if (result.success) circuitBreaker.recordSuccess(toolName);
    else if (result.configured) circuitBreaker.recordFailure(toolName, result.error || 'MCP test failed.');
    return res.status(result.success ? 200 : result.configured ? 502 : 503).json(result);
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message);
    return mcpError(res, { status: 502, code: error.code || 'MCP_TOOL_ERROR', message: error.message });
  }
}

async function listTools(req, res) {
  const db = await getDatabase();
  const tools = await db.all('SELECT * FROM mcp_tools ORDER BY category ASC, name ASC');
  const cbStatus = circuitBreaker.getStatus();

  const formatted = tools.map(t => {
    let actions = [];
    let equipped = ['Global Fleet'];
    try {
      actions = JSON.parse(t.actions_json || '[]');
      equipped = JSON.parse(t.equipped_agents || '["Global Fleet"]');
    } catch (e) {}

    const isLocked = t.is_locked === 1 || cbStatus.quarantinedTools.includes(t.name);
    const risk = t.risk_level || 'Low';

    return {
      id: t.name,
      name: t.name,
      provider: t.provider || 'genos',
      category: t.category,
      risk,
      riskLevel: risk,
      description: t.description,
      actions: actions.length > 0 ? actions : [t.name],
      inputSchema: getFullToolSchema(t.name),
      isLocked,
      circuitState: cbStatus.state,
      equippedTo: equipped
    };
  });

  res.setHeader?.('X-GenOS-MCP-Contract-Version', MCP_CONTRACT_VERSION);
  res.json(formatted);
}

async function testTool(req, res) {
  const { toolName: requestedToolName, args = {}, timeoutMs } = normalizeMcpEnvelope(req.body || {});
  const toolName = requestedToolName || 'genos_inspect';
  const db = await getDatabase();
  const tool = await db.get('SELECT name, is_locked FROM mcp_tools WHERE name = ?', toolName);
  if (!tool) return mcpError(res, { status: 404, code: 'MCP_TOOL_NOT_FOUND', message: `Unknown MCP tool: ${toolName}` });
  if (tool.is_locked === 1) return mcpError(res, { status: 503, code: 'TOOL_LOCKED', message: `Tool '${toolName}' is persisted in quarantine.` });
  const auth = await authorizeRequest({ req, db, toolName, args });
  if (auth.error) return mcpError(res, auth.error);
  const check = circuitBreaker.canExecute(toolName, requestRole(req), 'global', args);
  if (!check.allowed) return mcpError(res, { status: 503, code: check.reason || 'CIRCUIT_OPEN', message: check.message });
  return executeTestTransport({ res, toolName, args, timeoutMs });
}

async function toggleCircuitBreaker(req, res) {
  const { toolName, locked, reason = 'Operator quarantine lock' } = req.body || {};
  if (!toolName) {
    return res.status(400).json({ error: { code: 'INVALID_TOOL', message: 'toolName is required' } });
  }

  const db = await getDatabase();
  const tool = await db.get('SELECT name FROM mcp_tools WHERE name = ?', toolName);
  if (!tool) {
    return res.status(404).json({ error: { code: 'TOOL_NOT_FOUND', message: `Unknown MCP tool '${toolName}'.` } });
  }
  circuitBreaker.toggleToolLock(toolName, !!locked, reason);
  await db.run('UPDATE mcp_tools SET is_locked = ? WHERE name = ?', locked ? 1 : 0, toolName);

  res.json({
    success: true,
    toolName,
    isLocked: !!locked,
    reason
  });
}

async function equipTool(req, res) {
  const { toolName, targetAgents = ['Global Fleet'] } = req.body || {};
  if (!toolName) {
    return res.status(400).json({ error: { code: 'INVALID_TOOL', message: 'toolName is required' } });
  }
  const db = await getDatabase();
  const tool = await db.get('SELECT name FROM mcp_tools WHERE name = ?', toolName);
  if (!tool) {
    return res.status(404).json({ error: { code: 'TOOL_NOT_FOUND', message: `Unknown MCP tool '${toolName}'.` } });
  }
  await db.run('UPDATE mcp_tools SET equipped_agents = ? WHERE name = ?', JSON.stringify(targetAgents), toolName);

  res.json({ success: true, toolName, equippedAgents: targetAgents });
}

async function executeTool(req, res) {
  const { toolName, args, timeoutMs } = normalizeMcpEnvelope(req.body || {});
  const db = await getDatabase();
  const tool = await db.get('SELECT name, is_locked FROM mcp_tools WHERE name = ?', toolName);
  if (!tool) return mcpError(res, { status: 404, code: 'TOOL_NOT_FOUND', message: `Unknown MCP tool '${toolName}'.` });
  if (tool.is_locked === 1) return mcpError(res, { status: 503, code: 'TOOL_LOCKED', message: `Tool '${toolName}' is persisted in quarantine.` });
  const auth = await resolveToolAuthorization({ req, db, toolName, args });
  if (auth.error) return mcpError(res, auth.error);
  const { agentId, zeroTrust, deniedTools } = auth;
  await auditToolCall({ db, req, agentId, toolName, zeroTrust });
  if (zeroTrust.decision === 'deny') return mcpError(res, { status: 403, code: 'ZERO_TRUST_DENIED', message: zeroTrust.reason, details: zeroTrust });
  if (zeroTrust.decision === 'approval_required') {
    const approvalId = await requestApproval({ db, req, agentId, toolName, args, deniedTools });
    return res.status(202).json({ success: false, approvalRequired: true, approvalId, policy: zeroTrust });
  }
  const check = circuitBreaker.canExecute(toolName, requestRole(req), agentId || 'global', args);
  if (!check.allowed) return mcpError(res, { status: 503, code: check.reason || 'CIRCUIT_OPEN', message: check.message });
  return executeToolTransport({ res, toolName, args, timeoutMs, agentId });
}

async function dryRun(req, res, next) {
  try {
    const { toolName, args = {}, vfsState = {} } = req.body || {};
    const db = await getDatabase();
    const tool = await db.get('SELECT name FROM mcp_tools WHERE name = ?', toolName);
    if (!tool) return res.status(404).json({ error: { code: 'TOOL_NOT_FOUND', message: `Unknown MCP tool: ${toolName}` } });
    const check = circuitBreaker.canExecute(toolName, (req.user && req.user.role) || 'viewer', 'global', args);
    if (!check.allowed) return res.status(503).json({ error: { code: check.reason, message: check.message } });
    const result = vfsSandboxService.simulateDryRun(toolName, args, vfsState);
    circuitBreaker.recordSuccess(toolName);
    telemetry.emitEvent({ eventType: 'MCP_DRY_RUN_COMPLETED', agentId: 'mcp_controller', action: 'DRY_RUN', detail: `Dry-run calculated for '${toolName}'`, severity: 'info', payload: { toolName, args, result } });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getSchema(req, res, next) {
  try {
    const toolName = req.params.name || req.query.name;
    const db = await getDatabase();
    const tool = await db.get('SELECT name FROM mcp_tools WHERE name = ?', toolName);
    if (!tool) return res.status(404).json({ error: { code: 'TOOL_NOT_FOUND', message: `Unknown MCP tool: ${toolName}` } });
    const schema = getToolInputSchema(toolName, vfsSandboxService.getToolSchema(toolName));
    res.setHeader?.('X-GenOS-MCP-Contract-Version', MCP_CONTRACT_VERSION);
    res.json(schema);
  } catch (err) {
    next(err);
  }
}

async function getMetrics(req, res, next) {
  try {
    const filter = req.query.tool || null;
    const metrics = vfsSandboxService.getToolMetrics(filter);
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTools,
  testTool,
  toggleCircuitBreaker,
  equipTool,
  executeTool,
  dryRun,
  getSchema,
  getMetrics
};
