const crypto = require('crypto');
const { getDatabase } = require('../db');

function metadataValue(call, key) {
  const values = call?.metadata?.get?.(key) || [];
  return values.length ? String(values[0]) : '';
}

function tenantScope(call) {
  const request = call?.request || {};
  const organizationId = String(request.organization_id || metadataValue(call, 'x-organization-id')).trim();
  const projectId = String(request.project_id || metadataValue(call, 'x-project-id')).trim();
  if (!organizationId || !projectId) throw Object.assign(new Error('organization_id and project_id are required.'), { code: 16 });
  return { organizationId, projectId };
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workflow is alive via gRPC!" }),

  StartWorkflow: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { workflow_name, initial_data_json } = call.request || {};
      const scope = tenantScope(call);
      const data = initial_data_json ? JSON.parse(initial_data_json) : {};
      const workflow = await db.get("SELECT id, version FROM workflows WHERE name = ? AND organization_id = ? AND project_id = ? AND status IN ('staging', 'published') ORDER BY version DESC LIMIT 1", workflow_name, scope.organizationId, scope.projectId);
      if (!workflow) {
        callback(null, { workflow_id: '', status: 'not_found', output_json: JSON.stringify({ error: `Workflow '${workflow_name}' was not found.` }) });
        return;
      }
      const runId = `wfr-${crypto.randomUUID()}`;
      await db.run('INSERT INTO workflow_runs (id, workflow_id, workflow_version, organization_id, project_id, status, input_json) VALUES (?, ?, ?, ?, ?, ?, ?)', runId, workflow.id, workflow.version, scope.organizationId, scope.projectId, 'queued', JSON.stringify(data));
      callback(null, {
        workflow_id: runId,
        status: 'queued',
        output_json: '{}'
      });
    } catch (err) {
      callback(null, { workflow_id: '', status: 'error', output_json: err.message });
    }
  },

  GetWorkflowStatus: async (call, callback) => {
    try {
      const db = await getDatabase();
      const workflowId = call.request?.workflow_id || '';
      const scope = tenantScope(call);
      const run = await db.get('SELECT r.id, r.status, r.output_json, r.error_json FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.id = ? AND w.organization_id = ? AND w.project_id = ?', workflowId, scope.organizationId, scope.projectId);
      callback(null, {
        workflow_id: workflowId,
        status: run?.status || 'not_found',
        output_json: run?.output_json || run?.error_json || '{}'
      });
    } catch (err) {
      callback(null, { workflow_id: call.request?.workflow_id || '', status: 'error', output_json: JSON.stringify({ error: err.message }) });
    }
  }
};
