const runtimeAdapter = require('../services/agentRuntimeAdapter');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Orchestrator is alive via gRPC!" }),

  DispatchWorker: async (call, callback) => {
    try {
      const { orchestrator_id, worker_id, prompt } = call.request || {};
      if (!orchestrator_id || !worker_id || !prompt) {
        return callback(null, { success: false, status: 'orchestrator_id, worker_id, and prompt are required.', garage_slot: 0 });
      }
      const startPromise = runtimeAdapter.startMission({
        agentId: worker_id,
        orchestratorAgentId: orchestrator_id,
        prompt,
        executionMode: 'worker'
      });
      const result = await Promise.race([startPromise, new Promise((resolve) => setTimeout(() => resolve({ queued: true }), 25))]);
      startPromise.catch((error) => console.error(`[gRPC] Worker ${worker_id} failed:`, error.message));
      callback(null, {
        success: true,
        status: `Worker ${worker_id} dispatched for ${orchestrator_id}`,
        garage_slot: result?.local ? 0 : 1
      });
    } catch (err) {
      callback(null, { success: false, status: err.message, garage_slot: 0 });
    }
  }
};
