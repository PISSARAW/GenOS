const grpc = require('@grpc/grpc-js');
const { getDatabase } = require('../db');

function grpcError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Experiment is alive via gRPC!" }),

  RunExperiment: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { name, config_json, workspace_id, organization_id, project_id } = call.request || {};
      if (!workspace_id || !organization_id || !project_id) {
        throw grpcError(grpc.status.INVALID_ARGUMENT, 'workspace_id, organization_id and project_id are required.');
      }
      let config = {};
      try { config = config_json ? JSON.parse(config_json) : {}; } catch (error) { throw grpcError(grpc.status.INVALID_ARGUMENT, 'config_json must be valid JSON.'); }
      const workspace = await db.get('SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspace_id, organization_id, project_id);
      if (!workspace) throw grpcError(grpc.status.NOT_FOUND, 'workspace is not available in this project.');
      const expId = `exp-${require('crypto').randomUUID()}`;
      await db.run(
        'INSERT INTO experiments (id, workspace_id, organization_id, project_id, title, experiment_type, status, protocol_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        expId, workspace_id, organization_id, project_id, name || 'gRPC experiment', 'scientific_experiment', 'Running', JSON.stringify(config)
      );
      callback(null, { experiment_id: expId, status: 'running', result_json: '{}' });
    } catch (err) {
      callback({ code: err.code || grpc.status.INTERNAL, message: err.message });
    }
  },

  GetExperimentStatus: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { experiment_id, organization_id, project_id } = call.request || {};
      if (!experiment_id || !organization_id || !project_id) throw grpcError(grpc.status.INVALID_ARGUMENT, 'experiment_id, organization_id and project_id are required.');
      const exp = await db.get('SELECT e.* FROM experiments e JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? AND w.organization_id = ? AND w.project_id = ?', experiment_id, organization_id, project_id);
      if (!exp) throw grpcError(grpc.status.NOT_FOUND, `Experiment '${experiment_id}' was not found.`);
      callback(null, {
        experiment_id: exp.id,
        status: exp.status,
        result_json: exp.results_summary || exp.protocol_config || '{}'
      });
    } catch (err) {
      callback({ code: err.code || grpc.status.INTERNAL, message: err.message });
    }
  }
};
