/**
 * GenOS MCP Tool Arsenal & Circuit Breaker Controller
 */

const { getDatabase } = require('../db');
const circuitBreaker = require('../services/circuitBreaker');
const telemetry = require('../services/telemetryObserver');
const platformSafety = require('../services/platformSafetyService');
const mcpExecutor = require('../services/mcpExecutor');
const { MCP_CONTRACT_VERSION, getToolInputSchema, normalizeMcpEnvelope } = require('../services/mcpContract');

function mcpError(res, status, code, message, details = undefined) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

function resolveAgentId(req) {
  const authenticatedId = req.user?.username || req.user?.keyId || 'mcp_controller';
  const requestedId = String(req.body?.agentId || '').trim();
  if (requestedId && requestedId !== authenticatedId && req.user?.role !== 'admin' && !req.user?.permissions?.includes('all')) {
    const error = new Error('agentId must match the authenticated principal.');
    error.status = 403;
    throw error;
  }
  return requestedId || authenticatedId;
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
      inputSchema: getToolInputSchema(t.name),
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
  if (!tool) return mcpError(res, 404, 'MCP_TOOL_NOT_FOUND', `Unknown MCP tool: ${toolName}`);
  if (tool.is_locked === 1) return mcpError(res, 503, 'TOOL_LOCKED', `Tool '${toolName}' is persisted in quarantine.`);
  let agentId;
  try { agentId = resolveAgentId(req); } catch (error) { return mcpError(res, error.status || 403, error.code || 'AGENT_ID_FORBIDDEN', error.message); }
  const permissionRow = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id = ? AND project_id = ?', agentId, req.tenant.organizationId, req.tenant.projectId);
  const permissions = req.user?.role === 'admin'
    ? ['*']
    : req.user?.permissions?.includes('mcp:execute_safe')
      ? ['tool:execute']
      : (permissionRow ? JSON.parse(permissionRow.permissions_json || '[]') : []);
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const policy = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints: req.body.taints || [] });
  if (policy.decision !== 'allow') return mcpError(res, policy.decision === 'approval_required' ? 202 : 403, policy.decision === 'approval_required' ? 'APPROVAL_REQUIRED' : 'ZERO_TRUST_DENIED', policy.reason, policy);
  const check = circuitBreaker.canExecute(toolName, (req.user && req.user.role) || 'viewer', 'global', args);
  if (!check.allowed) return mcpError(res, 503, check.reason || 'CIRCUIT_OPEN', check.message);
  try {
    const result = await mcpExecutor.executeConfiguredTransport({ toolName, args, timeoutMs: mcpExecutor.normalizeMcpTimeout(timeoutMs, 15000) });
    if (result.success) circuitBreaker.recordSuccess(toolName);
    else if (result.configured) circuitBreaker.recordFailure(toolName, result.error || 'MCP test failed.');
    return res.status(result.success ? 200 : result.configured ? 502 : 503).json(result);
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message);
    return mcpError(res, 502, error.code || 'MCP_TOOL_ERROR', error.message);
  }
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
  const userRole = (req.user && req.user.role) || 'viewer';

  // Zero Trust gate is deliberately before the circuit breaker: a healthy
  // tool is still forbidden when the calling agent lacks authority or carries
  // tainted input. Admins retain a full permission set, while high-impact
  // operations still enter the human approval workflow.
  const db = await getDatabase();
  const tool = await db.get('SELECT name, is_locked FROM mcp_tools WHERE name = ?', toolName);
  if (!tool) return mcpError(res, 404, 'TOOL_NOT_FOUND', `Unknown MCP tool '${toolName}'.`);
  if (tool.is_locked === 1) return mcpError(res, 503, 'TOOL_LOCKED', `Tool '${toolName}' is persisted in quarantine.`);
  let agentId;
  try { agentId = resolveAgentId(req); } catch (error) { return mcpError(res, error.status || 403, error.code || 'AGENT_ID_FORBIDDEN', error.message); }
  const permissionRow = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id = ? AND project_id = ?', agentId, req.tenant.organizationId, req.tenant.projectId);
  const permissions = req.user?.role === 'admin'
    ? ['*']
    : req.user?.permissions?.includes('mcp:execute_safe')
      ? ['tool:execute']
      : (permissionRow ? JSON.parse(permissionRow.permissions_json || '[]') : []);
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const zeroTrust = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints: req.body.taints || [] });
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json,organization_id,project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', req.user?.keyId || req.user?.username || 'anonymous', agentId, 'TOOL_CALL', toolName, zeroTrust.decision, zeroTrust.reason, JSON.stringify(zeroTrust), req.tenant.organizationId, req.tenant.projectId);
  if (zeroTrust.decision === 'deny') return mcpError(res, 403, 'ZERO_TRUST_DENIED', zeroTrust.reason, zeroTrust);
  if (zeroTrust.decision === 'approval_required') {
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.run('INSERT INTO platform_approvals (id, action, agent_id, risk, uncertainty, requested_by, organization_id, project_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', approvalId, `tool:${toolName}`, agentId, 'high', 0.8, req.user?.username || agentId, req.tenant.organizationId, req.tenant.projectId, JSON.stringify({ toolName, args, taints: req.body.taints || [], deniedTools }));
    return res.status(202).json({ success: false, approvalRequired: true, approvalId, policy: zeroTrust });
  }

  const check = circuitBreaker.canExecute(toolName, userRole);
  if (!check.allowed) {
    return mcpError(res, 503, check.reason || 'CIRCUIT_OPEN', check.message);
  }

  try {
    const result = await mcpExecutor.executeConfiguredTransport({ toolName, args, timeoutMs: mcpExecutor.normalizeMcpTimeout(timeoutMs) });
    if (result.success) circuitBreaker.recordSuccess(toolName);
    else if (result.configured) circuitBreaker.recordFailure(toolName, result.error || `MCP tool '${toolName}' failed.`);
    telemetry.emitEvent({ eventType: result.success ? 'MCP_TOOL_EXECUTED' : 'MCP_TOOL_EXECUTION_FAILED', agentId, action: 'MCP_EXECUTE', detail: result.success ? `Executed '${toolName}' over ${result.transport}.` : (result.error || `MCP tool '${toolName}' failed.`), severity: result.success ? 'info' : 'warning', payload: { toolName, args, result } });
    return res.status(result.success ? 200 : result.configured ? 502 : 503).json(result);
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message);
    return mcpError(res, 502, error.code || 'MCP_TOOL_ERROR', error.message);
  }
}

const vfsSandboxService = require('../services/vfsSandboxService');

async function dryRun(req, res, next) {
  try {
    const { toolName, args = {}, vfsState = {} } = req.body || {};
    const db = await getDatabase();
    const tool = await db.get('SELECT name FROM mcp_tools WHERE name = ?', toolName);
    if (!tool) return res.status(404).json({ error: { code: 'TOOL_NOT_FOUND', message: `Unknown MCP tool: ${toolName}` } });
    const check = circuitBreaker.canExecute(toolName, (req.user && req.user.role) || 'viewer');
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
