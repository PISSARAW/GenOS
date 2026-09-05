const mcpExecutor = require('../services/mcpExecutor');

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
      callback(null, { tools: [] });
    }
  },

  CallTool: async (call, callback) => {
    try {
      const { tool_name, arguments_json } = call.request || {};
      const args = arguments_json ? JSON.parse(arguments_json) : {};
      const res = await mcpExecutor.callTool(tool_name, args);
      callback(null, {
        success: true,
        content_json: JSON.stringify(res),
        error: ''
      });
    } catch (err) {
      callback(null, { success: false, content_json: '{}', error: err.message });
    }
  }
};
