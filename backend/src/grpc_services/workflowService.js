const crypto = require('crypto');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workflow is alive via gRPC!" }),

  StartWorkflow: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { workflow_name, initial_data_json } = call.request || {};
      const data = initial_data_json ? JSON.parse(initial_data_json) : {};
      const workflow = await db.get('SELECT id, version FROM workflows WHERE name = ? ORDER BY version DESC LIMIT 1', workflow_name);
      if (!workflow) {
        callback(null, { workflow_id: '', status: 'not_found', output_json: JSON.stringify({ error: `Workflow '${workflow_name}' was not found.` }) });
        return;
      }
      const runId = `wfr-${crypto.randomUUID()}`;
      await db.run('INSERT INTO workflow_runs (id, workflow_id, workflow_version, status, input_json) VALUES (?, ?, ?, ?, ?)', runId, workflow.id, workflow.version, 'queued', JSON.stringify(data));
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
      const run = await db.get('SELECT id, status, output_json, error_json FROM workflow_runs WHERE id = ?', workflowId);
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
