const vfsSandbox = require('../services/vfsSandboxService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Ide is alive via gRPC!" }),

  ExecuteVfsOperation: async (call, callback) => {
    try {
      const { op, file_path, content, workspace_id } = call.request || {};
      if (!workspace_id) throw Object.assign(new Error('workspace_id is required.'), { code: 3 });
      const res = await vfsSandbox.executeVfsOperation(op, file_path, content, workspace_id);
      callback(null, { success: res.success !== false, message: res.message || 'ok' });
    } catch (err) {
      callback({ code: err.code === 3 ? 3 : 13, message: err.message });
    }
  },

  InspectVfs: (call, callback) => {
    if (!call.request?.workspace_id) return callback({ code: 3, message: 'workspace_id is required.' });
    const list = vfsSandbox.inspectVfs(call.request?.dir_path || '/', call.request.workspace_id);
    callback(null, { entries: list || [] });
  }
};
