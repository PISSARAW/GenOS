const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { getDatabase } = require('../db');
const { grpcStatusForError } = require('../services/grpcErrorMapper');

function metadataValue(call, key) {
  const values = call?.metadata?.get?.(key) || [];
  return values.length ? String(values[0]) : '';
}

function tenantScope(call) {
  const request = call?.request || {};
  const organizationId = String(request.organization_id || metadataValue(call, 'x-organization-id')).trim();
  const projectId = String(request.project_id || metadataValue(call, 'x-project-id')).trim();
  if (!organizationId || !projectId) {
    const err = new Error('organization_id and project_id are required.');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }
  return { organizationId, projectId };
}

function normalizeWorkflowError(error) {
  return { code: grpcStatusForError(error), message: error?.message || 'Workflow request failed.' };
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workflow is alive via gRPC!" }),

  StartWorkflow: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { workflow_name, initial_data_json } = call.request || {};
      const scope = tenantScope(call);
      if (!workflow_name || !String(workflow_name).trim()) {
        const err = new Error('workflow_name is required.');
        err.code = 'INVALID_ARGUMENT';
        throw err;
      }
      const data = initial_data_json ? JSON.parse(initial_data_json) : {};
      const workflow = await db.get("SELECT id, version FROM workflows WHERE name = ? AND organization_id = ? AND project_id = ? AND status IN ('staging', 'published') ORDER BY version DESC LIMIT 1", workflow_name, scope.organizationId, scope.projectId);
      if (!workflow) {
        callback({ code: grpc.status.NOT_FOUND, message: `Workflow '${workflow_name}' was not found.` });
        return;
      }
      const runId = `wfr-${crypto.randomUUID()}`;
      await db.run('INSERT INTO workflow_runs (id, workflow_id, workflow_version, organization_id, project_id, status, input_json) VALUES (?, ?, ?, ?, ?, ?, ?)', runId, workflow.id, workflow.version, scope.organizationId, scope.projectId, 'queued', JSON.stringify(data));
      callback(null, {
        workflow_id: runId,
        status: 'queued',
        output_json: '{}',
        success: true,
        error_code: '',
        error_message: ''
      });
    } catch (err) {
      const normalized = normalizeWorkflowError(err);
      callback({ code: normalized.code, message: normalized.message });
    }
  },

  GetWorkflowStatus: async (call, callback) => {
    try {
      const db = await getDatabase();
      const workflowId = call.request?.workflow_id || '';
      const scope = tenantScope(call);
      const run = await db.get('SELECT r.id, r.status, r.output_json, r.error_json FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.id = ? AND w.organization_id = ? AND w.project_id = ?', workflowId, scope.organizationId, scope.projectId);
      if (!run) {
        callback({ code: grpc.status.NOT_FOUND, message: `Workflow run '${workflowId}' was not found.` });
        return;
      }
      callback(null, {
        workflow_id: workflowId,
        status: run?.status || 'not_found',
        output_json: run?.output_json || run?.error_json || '{}',
        success: run.status === 'completed',
        error_code: run.status === 'failed' ? 'WORKFLOW_FAILED' : run.status === 'cancelled' ? 'WORKFLOW_CANCELLED' : '',
        error_message: run.status === 'failed' || run.status === 'cancelled' ? (run.error_json || `Workflow run is ${run.status}.`) : ''
      });
    } catch (err) {
      const normalized = normalizeWorkflowError(err);
      callback({ code: normalized.code, message: normalized.message });
    }
  }
};
