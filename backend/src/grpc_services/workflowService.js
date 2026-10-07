const autoOrch = require('../services/autonomousOrchestrationService');
const { getDatabase } = require('../db');
const grpc = require('@grpc/grpc-js');

async function workflowStatus(call, callback) {
  try {
    const request = call.request || {};
    const org = request.organization_id || null;
    const project = request.project_id || null;
    if (!request.workflow_id || Boolean(org) !== Boolean(project)) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'A run id and a complete tenant scope are required.' });
    }
    const db = await getDatabase();
    const row = await db.get('SELECT * FROM workflow_runs WHERE id = ? AND organization_id IS ? AND project_id IS ?',
      request.workflow_id, org, project);
    if (!row) return callback({ code: grpc.status.NOT_FOUND, message: 'Workflow run not found in this scope.' });
    callback(null, { workflow_id: row.id, status: row.status, output_json: row.output_json || '{}',
      success: row.status === 'completed', error_code: workflowErrorCode(row.status) });
  } catch (error) {
    callback({ code: grpc.status.INTERNAL, message: error.message });
  }
}

function workflowErrorCode(status) {
  if (status === 'failed') return 'WORKFLOW_FAILED';
  if (status === 'cancelled') return 'WORKFLOW_CANCELLED';
  return '';
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workflow is alive via gRPC!" }),

  StartWorkflow: async (call, callback) => {
    try {
      const { workflow_name, initial_data_json } = call.request || {};
      const data = initial_data_json ? JSON.parse(initial_data_json) : {};
      const wf = await autoOrch.startWorkflow(workflow_name, data);
      callback(null, {
        workflow_id: wf.id || `wf-${Date.now()}`,
        status: wf.status || 'started',
        output_json: '{}'
      });
    } catch (err) {
      callback(null, { workflow_id: '', status: 'error', output_json: err.message });
    }
  },

  GetWorkflowStatus: workflowStatus
};
