const registry = require('../services/workspaceRegistry');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Registry is alive via gRPC!" }),

  RegisterWorkspace: (call, callback) => {
    const { workspace_id, root_path } = call.request || {};
    registry.register(workspace_id, root_path);
    callback(null, { found: true, root_path: root_path || process.cwd() });
  },

  ResolveWorkspace: (call, callback) => {
    const root = registry.resolve(call.request?.workspace_id);
    callback(null, { found: !!root, root_path: root || '' });
  }
};
