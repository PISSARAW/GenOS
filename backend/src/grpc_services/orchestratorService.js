const fleet = require('../services/agentFleetService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Orchestrator is alive via gRPC!" }),

  DispatchWorker: async (call, callback) => {
    try {
      const { orchestrator_id, worker_id, prompt } = call.request || {};
      callback(null, {
        success: true,
        status: `Worker ${worker_id || 'worker-1'} dispatched for ${orchestrator_id}`,
        garage_slot: 1
      });
    } catch (err) {
      callback(null, { success: false, status: err.message, garage_slot: 0 });
    }
  }
};
