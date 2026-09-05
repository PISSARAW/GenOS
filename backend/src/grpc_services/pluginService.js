const pluginSandbox = require('../services/pluginSandbox');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Plugin is alive via gRPC!" }),

  ExecutePlugin: async (call, callback) => {
    try {
      const { plugin_id, input_json } = call.request || {};
      const input = input_json ? JSON.parse(input_json) : {};
      const res = await pluginSandbox.executePlugin(plugin_id, input);
      callback(null, { success: true, output_json: JSON.stringify(res) });
    } catch (err) {
      callback(null, { success: false, output_json: JSON.stringify({ error: err.message }) });
    }
  },

  ListPlugins: (call, callback) => {
    callback(null, { plugins: ['code_review', 'dependency_audit', 'doc_generator'] });
  }
};
