const autoOrch = require('../services/autonomousOrchestrationService');

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

  GetWorkflowStatus: (call, callback) => {
    callback(null, {
      workflow_id: call.request?.workflow_id || '',
      status: 'completed',
      output_json: '{}'
    });
  }
};
