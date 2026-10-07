const mcpExecutor = require('../services/mcpExecutor');
const { evaluateToolGating } = require('../services/biomimeticToolGatingService');
const grpc = require('@grpc/grpc-js');
const MCP_CONTRACT_VERSION = 'genos.mcp/v1';

function toGrpcStatusCode(error) {
  const code = error?.code || error?.status || '';
  if (['INVALID_ARGUMENT', 'BAD_REQUEST', 'INVALID_TOOL'].includes(code)) return grpc.status.INVALID_ARGUMENT;
  if (['NOT_FOUND', 'TOOL_NOT_FOUND', 'MCP_TOOL_NOT_FOUND', 'not_found'].includes(code)) return grpc.status.NOT_FOUND;
  if (['FORBIDDEN', 'PERMISSION_DENIED', 'ZERO_TRUST_DENIED', 'AGENT_ID_FORBIDDEN'].includes(code)) return grpc.status.PERMISSION_DENIED;
  if (['UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TOOL_LOCKED', 'blocked', 'circuit_open'].includes(code)) return grpc.status.UNAVAILABLE;
  if (['failed', 'MCP_TOOL_ERROR'].includes(code)) return grpc.status.INTERNAL;
  return grpc.status.INTERNAL;
}

function assertToolSucceeded(result) {
  if (result?.success !== false && result?.isError !== true) return;
  const error = result.error;
  throw Object.assign(new Error(error?.message || error || 'MCP tool execution failed.'),
    { code: result.code || error?.code || 'MCP_TOOL_ERROR' });
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
      assertToolSucceeded(res);
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

  EvaluateGating: (call, callback) => {
    try {
      const { query, candidate_tools, threshold_mv } = call.request || {};
      const options = {};
      if (Number.isFinite(threshold_mv) && threshold_mv !== 0) options.thresholdMv = threshold_mv;
      const gating = evaluateToolGating(query || '', candidate_tools || [], options);
      callback(null, gatingResponse(gating));
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message || 'Gating evaluation failed.' });
    }
  }
};

function gatingResponse(gating) {
  return {
        requires_tools: Boolean(gating.requiresTools),
        disinhibited_tools: gating.disinhibitedTools || [],
        membrane_potential_mv: Number(gating.membranePotentialMv || 0),
        gate_state: gating.gateState || 'UNKNOWN',
        reason: gating.decisionReason || gating.reason || ''
  };
}
