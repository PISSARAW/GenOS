const path = require('path');
const { status } = require('@grpc/grpc-js');
const { dispatchWorkerMission } = require('../services/orchestratorDispatchService');
const { getDatabase } = require('../db');
const workspaceLifecycle = require('../services/agentWorkspaceLifecycleService');
const workspaceBindings = require('../services/workerWorkspaceBindingService');

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
  const missionId = await resolveMissionId(db, worker_id, orchestrator_id);
  const persisted = workerDispatchMetadata(worker);
  let workspaceRoot;
  try {
    workspaceRoot = await workspaceLifecycle.createIsolatedWorkspace(worker.workspaceRoot, worker_id);
    const workspaceId = await bindDispatchWorkspace(db, worker, workspaceRoot);
    await bindPersistedScope({ db, worker, persisted, workspaceId, workspaceRoot });
    const result = await dispatchWorkerMission({
      agentId: worker_id, orchestratorAgentId: orchestrator_id, missionId, prompt, role: worker.role,
      workerKind: persisted.workerKind, methodContract: persisted.methodContract, scope: workspaceRoot,
      workspaceId, workspaceRoot, capsuleRoot: path.dirname(workspaceRoot), workspaceProvisioned: true,
      modelTier: call.request.model_tier || worker.modelTier || undefined,
      timeoutMs: call.request.timeout_ms || undefined, autonomousOrchestration: false
    });
    return { ...result, worker_id, orchestrator_id };
  } catch (error) {
    if (workspaceRoot) await rollbackDispatchWorkspace(db, worker, workspaceRoot);
    throw error;
  }
}

async function resolveMissionId(db, workerId, orchestratorId) {
  const mission = await db.get(`SELECT m.mission_id AS missionId FROM missions m
    JOIN mission_agents worker ON worker.mission_id=m.mission_id AND worker.agent_id=?
    JOIN mission_agents parent ON parent.mission_id=m.mission_id AND parent.agent_id=?
    WHERE m.orchestrator_agent_id=? ORDER BY m.rowid DESC LIMIT 1`,
  workerId, orchestratorId, orchestratorId);
  if (!mission || !mission.missionId) {
    throw new Error(`Worker ${workerId} has no mission owned by orchestrator ${orchestratorId}`);
  }
  return mission.missionId;
}

async function fetchWorker(db, worker_id, orchestrator_id) {
  return db.get(
    `SELECT a.id AS worker_id, a.role AS role, a.workspace_id AS workspaceId,
       a.metadata_json AS metadataJson, parent.id AS parentId, parent.workspace_id AS parentWorkspaceId,
       parent_workspace.organization_id AS organizationId, parent_workspace.project_id AS projectId,
       w.path AS workspaceRoot, a.model_tier AS modelTier, a.isolation_mode AS isolationMode
     FROM agents a JOIN agents parent ON parent.id = a.parent_agent_id
       AND parent.id = ? AND parent.execution_mode = 'orchestrator'
     LEFT JOIN workspaces w ON w.id = a.workspace_id
     LEFT JOIN workspaces parent_workspace ON parent_workspace.id = parent.workspace_id
     WHERE a.id = ? AND a.execution_mode = 'worker'`,
    orchestrator_id, worker_id
  );
}

function workerDispatchMetadata(worker) {
  try {
    const metadata = JSON.parse(worker.metadataJson || '{}');
    const contract = metadata.workerContract;
    return { metadata, workerKind: metadata.workerKind,
      methodContract: contract?.mission?.methodContract, scope: contract?.mission?.scope };
  } catch (_) {
    throw rpcError(status.FAILED_PRECONDITION,
      `Worker ${worker.worker_id || 'unknown'} has invalid persisted metadata`);
  }
}

function assertTenantScope(worker, organization_id, project_id) {
  if (![organization_id, project_id].every(value => typeof value === 'string' && value.trim())) {
    throw rpcError(status.INVALID_ARGUMENT, 'organization_id and project_id are required strings');
  }
  if (organization_id !== worker.organizationId || project_id !== worker.projectId) {
    throw new Error('organization_id and project_id must match the worker tenant scope');
  }
}

function assertRequestContract(worker, request) {
  if (request.workspace_id && request.workspace_id !== worker.workspaceId) {
    throw rpcError(status.INVALID_ARGUMENT, 'workspace_id must match the assigned worker workspace');
  }
  if (request.timeout_ms !== undefined && request.timeout_ms !== 0 && (!Number.isFinite(request.timeout_ms) || request.timeout_ms < 0)) {
    throw Object.assign(new Error('timeout_ms must be positive when provided'), { code: status.INVALID_ARGUMENT });
  }
}

async function bindDispatchWorkspace(db, worker, workspaceRoot) {
  return workspaceBindings.bindWorkerWorkspace(db, {
    workerId: worker.worker_id, parentId: worker.parentId,
    parentWorkspaceId: worker.parentWorkspaceId, workspaceRoot
  });
}

async function bindPersistedScope({ db, worker, persisted, workspaceId, workspaceRoot }) {
  if (!persisted.metadata.workerContract) return;
  const metadata = { ...persisted.metadata, workerContract: {
    ...persisted.metadata.workerContract,
    mission: { ...persisted.metadata.workerContract.mission, scope: workspaceRoot }
  } };
  const updated = await db.run('UPDATE agents SET metadata_json = ? WHERE id = ? AND workspace_id = ?',
    JSON.stringify(metadata), worker.worker_id, workspaceId);
  if (updated.changes !== 1) throw new Error(`Worker ${worker.worker_id} scope binding was lost`);
}

async function rollbackDispatchWorkspace(db, worker, workspaceRoot) {
  await ignoreFailure(db.run('UPDATE agents SET workspace_id = ?, metadata_json = ? WHERE id = ?',
    worker.workspaceId, worker.metadataJson, worker.worker_id));
  await ignoreFailure(db.run(`DELETE FROM workspaces WHERE path = ?
    AND tags LIKE '%"worker_capsule"%'
    AND NOT EXISTS (SELECT 1 FROM agents WHERE agents.workspace_id = workspaces.id)`, workspaceRoot));
  await ignoreFailure(workspaceLifecycle.cleanupWorkspace(workspaceRoot));
  await workspaceLifecycle.forgetWorkspace(worker.worker_id);
}

async function ignoreFailure(operation) {
  try { return await operation; } catch (_) { return undefined; }
}

function rpcError(code, message) {
  return Object.assign(new Error(message), { code });
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
