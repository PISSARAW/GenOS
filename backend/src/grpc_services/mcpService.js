const mcpExecutor = require('../services/mcpExecutor');
const grpc = require('@grpc/grpc-js');

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
      callback(null, { tools: list });
    } catch (err) {
      callback({ code: grpc.status.UNAVAILABLE, message: `MCP tool discovery failed: ${err.message}` });
    }
  },

  CallTool: async (call, callback) => {
    try {
      const { tool_name, arguments_json, timeout_ms } = call.request || {};
      const args = arguments_json ? JSON.parse(arguments_json) : {};
      const res = await mcpExecutor.callTool(tool_name, args, timeout_ms);
      callback(null, {
        success: true,
        content_json: JSON.stringify(res),
        error: '',
        error_code: '',
        status: 'completed'
      });
    } catch (err) {
      callback(null, { success: false, content_json: '{}', error: err.message, error_code: err.code || 'MCP_TOOL_ERROR', status: err.status || 'failed' });
    }
  }
};
