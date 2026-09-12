const mcpExecutor = require('../services/mcpExecutor');
const grpc = require('@grpc/grpc-js');
const MCP_CONTRACT_VERSION = 'genos.mcp/v1';

function toGrpcStatusCode(error) {
  const code = error?.code || error?.status || '';
  if (code === 'INVALID_ARGUMENT' || code === 'BAD_REQUEST' || code === 'INVALID_TOOL') return grpc.status.INVALID_ARGUMENT;
  if (code === 'NOT_FOUND' || code === 'TOOL_NOT_FOUND' || code === 'MCP_TOOL_NOT_FOUND' || code === 'not_found') return grpc.status.NOT_FOUND;
  if (['FORBIDDEN', 'PERMISSION_DENIED', 'ZERO_TRUST_DENIED', 'AGENT_ID_FORBIDDEN'].includes(code)) return grpc.status.PERMISSION_DENIED;
  if (code === 'UNAVAILABLE' || code === 'SERVICE_UNAVAILABLE' || code === 'TOOL_LOCKED' || code === 'blocked' || code === 'circuit_open') return grpc.status.UNAVAILABLE;
  if (code === 'failed' || code === 'MCP_TOOL_ERROR') return grpc.status.INTERNAL;
  return grpc.status.INTERNAL;
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Mcp is alive via gRPC!" }),

  ListTools: async (call, callback) => {
    try {
      const tools = await mcpExecutor.listTools();
      const list = (tools || []).map((t) => ({
        name: t.name,
        description: t.description || '',
        schema_json: JSON.stringify(t.inputSchema || {})
      }));
      callback(null, { tools: list, contract_version: MCP_CONTRACT_VERSION });
    } catch (err) {
      callback({ code: grpc.status.UNAVAILABLE, message: 'MCP tool discovery failed: ' + err.message });
    }
  },

  CallTool: async (call, callback) => {
    try {
      const { tool_name, arguments_json, timeout_ms } = call.request || {};
      if (!tool_name || !String(tool_name).trim()) {
        throw Object.assign(new Error('tool_name is required.'), { code: 'INVALID_ARGUMENT' });
      }
      const args = arguments_json ? JSON.parse(arguments_json) : {};
      const res = await mcpExecutor.callTool(tool_name, args, timeout_ms);
      callback(null, {
        success: true,
        content_json: JSON.stringify(res),
        error: '',
        error_code: '',
        status: 'completed',
        contract_version: MCP_CONTRACT_VERSION
      });
    } catch (err) {
      callback({ code: toGrpcStatusCode(err), message: err.message || 'MCP tool execution failed.' });
    }
  },

  EvaluateGating: async (call, callback) => {
    try {
      const { query, candidate_tools, threshold_mv } = call.request || {};
      const { evaluateToolGating } = require('../services/biomimeticToolGatingService');
      const res = evaluateToolGating(query || '', candidate_tools || [], { thresholdMv: threshold_mv });
      callback(null, {
        requires_tools: Boolean(res.requiresTools),
        disinhibited_tools: res.disinhibitedTools || [],
        membrane_potential_mv: res.membranePotentialMv || 0,
        gate_state: res.gateState || 'RESTING',
        reason: res.reason || ''
      });
    } catch (err) {
      callback(null, {
        requires_tools: false,
        disinhibited_tools: [],
        membrane_potential_mv: 0,
        gate_state: 'ERROR',
        reason: err.message
      });
    }
  }
};
