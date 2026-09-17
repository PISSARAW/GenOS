const fleet = require('../services/agentFleetService');
const runtimeAdapter = require('../services/agentRuntimeAdapter');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Orchestrator is alive via gRPC!" }),

  DispatchWorker: async (call, callback) => {
    try {
      const { orchestrator_id, worker_id, prompt } = call.request || {};
      if (!orchestrator_id || !worker_id || !prompt) {
        return callback(null, { success: false, status: 'orchestrator_id, worker_id and prompt are required', garage_slot: 0 });
      }
      const result = await runtimeAdapter.startMission({
        agentId: worker_id,
        orchestratorAgentId: orchestrator_id,
        prompt,
        role: 'worker',
        workspaceId: call.request.workspace_id || undefined,
        modelTier: call.request.model_tier || undefined,
        timeoutMs: call.request.timeout_ms || undefined,
        autonomousOrchestration: false
      });
      callback(null, {
        success: result?.started === true,
        status: result?.duplicate ? `Worker ${worker_id} was already running for ${orchestrator_id}` : `Worker ${worker_id} dispatched for ${orchestrator_id}`,
        garage_slot: 0
      });
    } catch (err) {
      callback(null, { success: false, status: err.message, garage_slot: 0 });
    }
  }
};
