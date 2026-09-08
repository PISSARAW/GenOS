const vfsSandbox = require('../services/vfsSandboxService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Ide is alive via gRPC!" }),

  ExecuteVfsOperation: async (call, callback) => {
    try {
      const { op, file_path, content } = call.request || {};
      const res = await vfsSandbox.executeVfsOperation(op, file_path, content);
      callback(null, { success: res.success !== false, message: res.message || 'ok' });
    } catch (err) {
      callback(null, { success: false, message: err.message });
    }
  },

  InspectVfs: (call, callback) => {
    const list = vfsSandbox.inspectVfs(call.request?.dir_path || '/');
    callback(null, { entries: list || [] });
  }
};
