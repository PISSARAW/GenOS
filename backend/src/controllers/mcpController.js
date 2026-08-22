/**
 * GenOS MCP Tool Arsenal & Circuit Breaker Controller
 */

const { getDatabase } = require('../db');
const circuitBreaker = require('../services/circuitBreaker');
const telemetry = require('../services/telemetryObserver');
const platformSafety = require('../services/platformSafetyService');

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
      isLocked,
      circuitState: cbStatus.state,
      equippedTo: equipped
    };
  });

  res.json(formatted);
}

function testTool(req, res) {
  const { toolName = 'genos_inspect', args = {} } = req.body || {};
  const userRole = (req.user && req.user.role) || 'viewer';

  const check = circuitBreaker.canExecute(toolName, userRole);
  if (!check.allowed) {
    return res.status(503).json({
      error: { code: check.reason, message: check.message }
    });
  }

  circuitBreaker.recordSuccess(toolName);

  telemetry.emitEvent({
    eventType: 'TOOL_TEST_EXECUTED',
    agentId: 'mcp_controller',
    action: 'TEST',
    detail: `Tested tool '${toolName}' in sandbox successfully`,
    severity: 'info',
    payload: { toolName, args }
  });

  res.json({
    success: true,
    result: `Sandbox test of tool '${toolName}' succeeded. State: ${check.state}. Args: ${JSON.stringify(args)}`
  });
}

async function toggleCircuitBreaker(req, res) {
  const { toolName, locked, reason = 'Operator quarantine lock' } = req.body || {};
  if (!toolName) {
    return res.status(400).json({ error: { code: 'INVALID_TOOL', message: 'toolName is required' } });
  }

  circuitBreaker.toggleToolLock(toolName, !!locked, reason);

  const db = await getDatabase();
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
  const db = await getDatabase();
  await db.run('UPDATE mcp_tools SET equipped_agents = ? WHERE name = ?', JSON.stringify(targetAgents), toolName);

  res.json({ success: true, toolName, equippedAgents: targetAgents });
}

async function executeTool(req, res) {
  const { toolName, args = {} } = req.body || {};
  const userRole = (req.user && req.user.role) || 'viewer';

  // Zero Trust gate is deliberately before the circuit breaker: a healthy
  // tool is still forbidden when the calling agent lacks authority or carries
  // tainted input. Admins retain a full permission set, while high-impact
  // operations still enter the human approval workflow.
  const db = await getDatabase();
  const agentId = req.body.agentId || (req.user && req.user.username) || 'mcp_controller';
  const permissionRow = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ?', agentId);
  const permissions = req.user?.role === 'admin' ? ['*'] : (permissionRow ? JSON.parse(permissionRow.permissions_json || '[]') : []);
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const zeroTrust = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints: req.body.taints || [] });
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', req.user?.username || 'anonymous', agentId, 'TOOL_CALL', toolName, zeroTrust.decision, zeroTrust.reason, JSON.stringify(zeroTrust));
  if (zeroTrust.decision === 'deny') return res.status(403).json({ error: { code: 'ZERO_TRUST_DENIED', message: zeroTrust.reason }, policy: zeroTrust });
  if (zeroTrust.decision === 'approval_required') {
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.run('INSERT INTO platform_approvals (id, action, agent_id, risk, uncertainty, requested_by, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', approvalId, `tool:${toolName}`, agentId, 'high', 0.8, req.user?.username || agentId, JSON.stringify({ toolName, args }));
    return res.status(202).json({ success: false, approvalRequired: true, approvalId, policy: zeroTrust });
  }

  const check = circuitBreaker.canExecute(toolName, userRole);
  if (!check.allowed) {
    return res.status(503).json({
      error: { code: check.reason, message: check.message }
    });
  }

  circuitBreaker.recordSuccess(toolName);

  telemetry.emitEvent({
    eventType: 'TOOL_CALL_COMPLETED',
    agentId: req.user ? req.user.username : 'mcp_controller',
    action: 'EXECUTE',
    detail: `Tool '${toolName}' executed successfully`,
    severity: 'info',
    payload: { toolName, args }
  });

  res.json({
    success: true,
    toolName,
    output: `Execution of ${toolName} completed with output status: 0`,
    executedAt: new Date().toISOString()
  });
}

const vfsSandboxService = require('../services/vfsSandboxService');

async function dryRun(req, res, next) {
  try {
    const { toolName, args = {}, vfsState = {} } = req.body || {};
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
    const schema = vfsSandboxService.getToolSchema(toolName);
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
