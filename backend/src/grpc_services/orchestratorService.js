const path = require('path');
const fleet = require('../services/agentFleetService');
const { dispatchWorkerMission } = require('../services/orchestratorDispatchService');
const { getDatabase } = require('../db');
const { createIsolatedWorkspace } = require('../services/agentRuntimeAdapter');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Orchestrator is alive via gRPC!" }),

  DispatchWorker: async (call, callback) => {
    try {
      const { orchestrator_id, worker_id, prompt, organization_id, project_id } = call.request || {};
      if (!orchestrator_id || !worker_id || !prompt) {
        return callback(null, { success: false, status: 'orchestrator_id, worker_id and prompt are required', garage_slot: 0 });
      }
      const db = await getDatabase();
      const worker = await db.get(
        `SELECT a.workspace_id AS workspaceId, COALESCE(a.organization_id, w.organization_id) AS organizationId, COALESCE(a.project_id, w.project_id) AS projectId, w.path AS workspaceRoot, a.model_tier AS modelTier
         FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
         WHERE a.id = ? AND a.parent_agent_id = ? AND a.execution_mode = 'worker'`,
        worker_id,
        orchestrator_id
      );
      if (!worker) {
        return callback(null, { success: false, status: `Worker ${worker_id} is not assigned to orchestrator ${orchestrator_id}`, garage_slot: 0 });
      }
      if (!organization_id || !project_id || organization_id !== worker.organizationId || project_id !== worker.projectId) {
        return callback(null, { success: false, status: 'organization_id and project_id must match the worker tenant scope', garage_slot: 0 });
      }
      if (!worker.workspaceRoot) {
        return callback(null, { success: false, status: `Worker ${worker_id} has no source workspace`, garage_slot: 0 });
      }
      const workspaceRoot = await createIsolatedWorkspace(worker.workspaceRoot, worker_id, { capsuleRoot: path.dirname(worker.workspaceRoot) });
      const result = await dispatchWorkerMission({
        agentId: worker_id,
        orchestratorAgentId: orchestrator_id,
        prompt,
        role: 'worker',
        workspaceId: call.request.workspace_id || worker.workspaceId || undefined,
        workspaceRoot,
        capsuleRoot: path.dirname(workspaceRoot),
        workspaceProvisioned: true,
        modelTier: call.request.model_tier || worker.modelTier || undefined,
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
