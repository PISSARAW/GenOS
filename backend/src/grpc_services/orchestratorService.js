const runtimeAdapter = require('../services/agentRuntimeAdapter');
const { getDatabase } = require('../db');
const agentAuthority = require('../services/agentAuthorityService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Orchestrator is alive via gRPC!" }),

  DispatchWorker: async (call, callback) => {
    try {
      const { orchestrator_id, worker_id, prompt } = call.request || {};
      if (!orchestrator_id || !worker_id || !prompt) {
        return callback(null, { success: false, status: 'orchestrator_id, worker_id, and prompt are required.', garage_slot: 0 });
      }
      const db = await getDatabase();
      const pair = await db.get(`SELECT worker.id
        FROM agents worker
        JOIN agents orchestrator ON orchestrator.id = worker.parent_agent_id
        JOIN workspaces ww ON ww.id = worker.workspace_id
        JOIN workspaces wo ON wo.id = orchestrator.workspace_id
        WHERE worker.id = ? AND orchestrator.id = ? AND worker.execution_mode = 'worker'
          AND ww.organization_id = wo.organization_id AND ww.project_id = wo.project_id`, worker_id, orchestrator_id);
      if (!pair) throw Object.assign(new Error('Worker and orchestrator are not in the same tenant.'), { code: 'INVALID_MISSION_SCOPE' });
      const workspace = await db.get('SELECT workspace_id FROM agents WHERE id = ?', worker_id);
      await agentAuthority.authorizeMission(db, worker_id, orchestrator_id, workspace?.workspace_id || null);
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
