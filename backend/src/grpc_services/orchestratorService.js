const path = require('path');
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
      const ctx = { call, orchestrator_id, worker_id, prompt, organization_id, project_id };
      const result = await dispatchWorker(ctx);
      callbackResult(result, callback);
    } catch (err) {
      callback(null, { success: false, status: err.message, garage_slot: 0 });
    }
  }
};

async function dispatchWorker(ctx) {
  const { call, orchestrator_id, worker_id, prompt, organization_id, project_id } = ctx;
  const db = await getDatabase();
  const worker = await fetchWorker(db, worker_id, orchestrator_id);
  if (!worker) throw new Error(`Worker ${worker_id} is not assigned to orchestrator ${orchestrator_id}`);
  assertTenantScope(worker, organization_id, project_id);
  assertWorkspacePresent(worker, worker_id);
  await assertWorkspaceIsolated(db, worker);
  const workspaceRoot = await createIsolatedWorkspace(worker.workspaceRoot, worker_id, { capsuleRoot: path.dirname(worker.workspaceRoot) });
  const result = await dispatchWorkerMission({
    agentId: worker_id, orchestratorAgentId: orchestrator_id, prompt, role: 'worker',
    workspaceId: call.request.workspace_id || worker.workspaceId || undefined,
    workspaceRoot, capsuleRoot: path.dirname(workspaceRoot), workspaceProvisioned: true,
    modelTier: call.request.model_tier || worker.modelTier || undefined,
    timeoutMs: call.request.timeout_ms || undefined, autonomousOrchestration: false
  });
  return { ...result, worker_id, orchestrator_id };
}

async function fetchWorker(db, worker_id, orchestrator_id) {
  return db.get(
    `SELECT a.workspace_id AS workspaceId, COALESCE(a.organization_id, w.organization_id) AS organizationId, COALESCE(a.project_id, w.project_id) AS projectId, w.path AS workspaceRoot, a.model_tier AS modelTier
     FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ? AND a.parent_agent_id = ? AND a.execution_mode = 'worker'`,
    worker_id, orchestrator_id
  );
}

function assertTenantScope(worker, organization_id, project_id) {
  if (!organization_id || !project_id || organization_id !== worker.organizationId || project_id !== worker.projectId) {
    throw new Error('organization_id and project_id must match the worker tenant scope');
  }
}

function assertWorkspacePresent(worker, worker_id) {
  if (!worker.workspaceRoot) throw new Error(`Worker ${worker_id} has no source workspace`);
}

async function assertWorkspaceIsolated(db, worker) {
  const existing = await db.get(`SELECT id, path, isolated FROM workspaces WHERE id = ?`, worker.workspace_id);
  if (!existing || !existing.isolated) throw new Error(`Worker ${worker.worker_id || 'unknown'} workspace is not isolated`);
}

function callbackResult(result, callback) {
  callback(null, {
    success: result?.started === true,
    status: result?.duplicate ? `Worker ${result.worker_id} was already running for ${result.orchestrator_id}` : `Worker ${result.worker_id} dispatched for ${result.orchestrator_id}`,
    garage_slot: 0
  });
}
