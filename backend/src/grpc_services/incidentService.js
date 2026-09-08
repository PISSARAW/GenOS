const grpc = require('@grpc/grpc-js');
const { getDatabase } = require('../db');

function grpcError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function tenantScope(request) {
  const organizationId = String(request?.organization_id || '').trim();
  const projectId = String(request?.project_id || '').trim();
  if (!organizationId || !projectId) throw grpcError(grpc.status.INVALID_ARGUMENT, 'organization_id and project_id are required.');
  return { organizationId, projectId };
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Incident is alive via gRPC!" }),

  ReportIncident: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { agent_id, reason, details_json } = call.request || {};
      const scope = tenantScope(call.request);
      if (!agent_id || !reason || !String(reason).trim()) {
        throw grpcError(grpc.status.INVALID_ARGUMENT, 'agent_id and reason are required.');
      }
      const incId = `inc-${Date.now()}`;
      await db.run(
        'INSERT INTO global_alerts (id, title, status, agent_name, workspace_name, organization_id, project_id, severity, context_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        incId, reason, 'blocked', agent_id, '', scope.organizationId, scope.projectId, 'warning', details_json || '{}'
      );
      callback(null, { incident_id: incId, status: 'reported' });
    } catch (err) {
      callback({ code: err.code || grpc.status.INTERNAL, message: err.message });
    }
  },

  GetIncidentHistory: async (call, callback) => {
    try {
      const db = await getDatabase();
      const scope = tenantScope(call.request);
      const rows = await db.all('SELECT * FROM global_alerts WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50', scope.organizationId, scope.projectId);
      callback(null, { history_json: JSON.stringify(rows), count: rows.length });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  }
};
