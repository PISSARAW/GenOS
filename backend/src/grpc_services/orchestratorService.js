const path = require('path');
const { status } = require('@grpc/grpc-js');
const { dispatchWorkerMission } = require('../services/orchestratorDispatchService');
const { getDatabase } = require('../db');
const workspaceLifecycle = require('../services/agentWorkspaceLifecycleService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Orchestrator is alive via gRPC!" }),

  DispatchWorker: async (call, callback) => {
    try {
      const { orchestrator_id, worker_id, prompt, organization_id, project_id } = call.request || {};
      if ([orchestrator_id, worker_id, prompt].some((value) => typeof value !== 'string' || !value.trim())) {
        return callback({ code: status.INVALID_ARGUMENT, message: 'orchestrator_id, worker_id and prompt are required' });
      }
      const ctx = { call, orchestrator_id, worker_id, prompt, organization_id, project_id };
      const result = await dispatchWorker(ctx);
      callbackResult(result, callback);
    } catch (err) {
      callback({ code: Number.isInteger(err.code) ? err.code : status.FAILED_PRECONDITION, message: err.message });
    }
  }
};

async function dispatchWorker(ctx) {
  const { call, orchestrator_id, worker_id, prompt, organization_id, project_id } = ctx;
  const db = await getDatabase();
  const worker = await fetchWorker(db, worker_id, orchestrator_id);
  if (!worker) throw new Error(`Worker ${worker_id} is not assigned to orchestrator ${orchestrator_id}`);
  assertTenantScope(worker, organization_id, project_id);
  assertRequestContract(worker, call.request);
  assertWorkspacePresent(worker, worker_id);
  assertWorkspaceIsolated(worker);
  const workspaceRoot = await workspaceLifecycle.createIsolatedWorkspace(worker.workspaceRoot, worker_id);
  const result = await dispatchWorkerMission({
    agentId: worker_id, orchestratorAgentId: orchestrator_id, prompt, role: worker.role,
    workspaceId: call.request.workspace_id || worker.workspaceId || undefined,
    workspaceRoot, capsuleRoot: path.dirname(workspaceRoot), workspaceProvisioned: true,
    modelTier: call.request.model_tier || worker.modelTier || undefined,
    timeoutMs: call.request.timeout_ms || undefined, autonomousOrchestration: false
  });
  return { ...result, worker_id, orchestrator_id };
}

async function fetchWorker(db, worker_id, orchestrator_id) {
  return db.get(
    `SELECT a.id AS worker_id, a.role AS role, a.workspace_id AS workspaceId, w.organization_id AS organizationId, w.project_id AS projectId, w.path AS workspaceRoot, a.model_tier AS modelTier, a.isolation_mode AS isolationMode
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

function assertRequestContract(worker, request) {
  if (request.workspace_id && request.workspace_id !== worker.workspaceId) throw new Error('workspace_id must match the assigned worker workspace');
  if (request.timeout_ms !== undefined && request.timeout_ms !== 0 && (!Number.isFinite(request.timeout_ms) || request.timeout_ms < 0)) {
    throw Object.assign(new Error('timeout_ms must be positive when provided'), { code: status.INVALID_ARGUMENT });
  }
}

function assertWorkspacePresent(worker, worker_id) {
  if (!worker.workspaceRoot) throw new Error(`Worker ${worker_id} has no source workspace`);
}

function assertWorkspaceIsolated(worker) {
  const isolatedModes = ['Branch', 'VFS_Branch', 'Snapshot'];
  if (!isolatedModes.includes(worker.isolationMode)) throw new Error(`Worker ${worker.worker_id || 'unknown'} is not configured for isolated execution`);
}

function callbackResult(result, callback) {
  callback(null, {
    success: result?.started === true,
    status: result?.duplicate ? `Worker ${result.worker_id} was already running for ${result.orchestrator_id}` : `Worker ${result.worker_id} dispatched for ${result.orchestrator_id}`,
    garage_slot: 0
  });
}
