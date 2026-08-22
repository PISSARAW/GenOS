const { getDatabase } = require('../db');
const circuitBreaker = require('./circuitBreaker');
const telemetry = require('./telemetryObserver');
const platformSafety = require('./platformSafetyService');

async function execute({ agentId, toolName, args = {}, taints = [] }) {
  const db = await getDatabase();
  const permissionRow = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ?', agentId);
  const permissions = permissionRow ? JSON.parse(permissionRow.permissions_json || '[]') : [];
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const policy = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints });
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', agentId, agentId, 'WORKFLOW_TOOL_CALL', toolName, policy.decision, policy.reason, JSON.stringify({ args, taints, policy }));
  if (policy.decision !== 'allow') return { success: false, status: policy.decision, policy };
  const tool = await db.get('SELECT * FROM mcp_tools WHERE name = ?', toolName);
  if (!tool) return { success: false, status: 'not_found', error: `Unknown MCP tool: ${toolName}` };
  const circuit = circuitBreaker.canExecute(toolName, 'operator');
  if (!circuit.allowed) return { success: false, status: 'circuit_open', error: circuit.message };
  const error = `MCP tool '${toolName}' has no configured executable transport. Use its dry-run analysis or configure a real MCP server before adding it to a workflow.`;
  telemetry.emitEvent({ eventType: 'WORKFLOW_MCP_TOOL_UNAVAILABLE', agentId, action: 'MCP_EXECUTE', detail: error, severity: 'warning', payload: { toolName, args } });
  return { success: false, status: 'unavailable', error };
}

module.exports = { execute };
