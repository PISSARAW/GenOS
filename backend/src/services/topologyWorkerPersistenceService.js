'use strict';

const workerKinds = require('./agents/workerKindService');

async function ensureTopologyWorker(db, input) {
  const workerKind = workerKinds.resolveWorkerKind(input.workerKind, input.role);
  const workerContract = workerKinds.buildWorkerContract(workerKind, {
    prompt: input.mission,
    orchestratorAgentId: input.parentId,
    methodContract: input.methodContract,
    workerAssignment: input.workerAssignment,
    workerTokenLimit: input.workerTokenLimit,
    topologySessionId: input.topologySessionId,
    nicheDomain: input.nicheDomain,
    hostContractId: input.hostContractId,
    hostCapabilities: input.hostCapabilities
  });
  const existing = await db.get('SELECT id, parent_agent_id, execution_mode, role, status, workspace_id, metadata_json FROM agents WHERE id = ?', input.workerId);
  if (existing) return validateExistingWorker({ db, existing, input, workerKind, workerContract });
  return insertTopologyWorker({ db, input, workerKind, workerContract });
}

async function validateExistingWorker({ db, existing, input, workerKind, workerContract }) {
  if (!matchesWorkerIdentity(existing, input)) throw Object.assign(new Error(`Worker identity '${input.workerId}' conflicts with an existing agent.`), { code: 'TOPOLOGY_WORKER_IDENTITY_CONFLICT' });
  const metadata = parseMetadata(existing.metadata_json);
  if (metadata.workerKind && metadata.workerKind !== workerKind) {
    throw Object.assign(new Error(`Worker '${input.workerId}' is persisted as '${metadata.workerKind}', not '${workerKind}'.`), { code: 'TOPOLOGY_WORKER_KIND_MISMATCH' });
  }
  if (await workerIsBusy(db, existing, input.workerId)) {
    if (input.allowBusyExisting === true) return { workerId: input.workerId, created: false, busy: true };
    throw workerBusyError(input.workerId);
  }
  const updated = await db.run(`UPDATE agents SET metadata_json = ? WHERE id = ?
    AND status != 'running' AND NOT EXISTS (
      SELECT 1 FROM garage_queue q WHERE q.worker_id = agents.id
        AND (q.status IN ('queued', 'claimed', 'running')
          OR q.phase IN ('frozen', 'thawing', 'freezing', 'freeze_failed', 'cancelling'))
    )`, JSON.stringify({
    ...metadata, workerKind, workerContract,
    workerAssignment: input.workerAssignment || null, methodContract: input.methodContract || null,
    topologySessionId: input.topologySessionId || null
  }), input.workerId);
  if (updated.changes !== 1) throw workerBusyError(input.workerId);
  return { workerId: input.workerId, created: false };
}

function matchesWorkerIdentity(existing, input) {
  return existing.parent_agent_id === input.parentId
    && existing.execution_mode === 'worker'
    && existing.role === input.role
    && (existing.workspace_id || null) === (input.workspaceId || null);
}

async function workerIsBusy(db, existing, workerId) {
  if (existing.status === 'running') return true;
  const lease = await db.get(`SELECT request_id FROM garage_queue WHERE worker_id = ?
    AND (status IN ('queued', 'claimed', 'running')
      OR phase IN ('frozen', 'thawing', 'freezing', 'freeze_failed', 'cancelling')) LIMIT 1`, workerId);
  return Boolean(lease);
}

function workerBusyError(workerId) {
  return Object.assign(new Error(`Worker '${workerId}' cannot be rebound while a runtime or Garage claim is active.`), {
    code: 'TOPOLOGY_WORKER_BUSY'
  });
}

function parseMetadata(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) { return {}; }
}

async function insertTopologyWorker({ db, input, workerKind, workerContract }) {
  await db.run(`INSERT INTO agents
    (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, isolation_mode, parent_agent_id, about, current_task, metadata_json)
    VALUES (?, ?, ?, 'idle', 'GenOS', 'worker', ?, ?, ?, ?, ?, ?, ?)`,
  input.workerId, input.name || input.role, input.role || 'worker', input.workspaceId || null,
  input.modelTier || 'standard', input.isolationMode || 'Branch', input.parentId,
  `Worker scope: ${input.mission || ''}`,
  input.mission || '', JSON.stringify({
    workerKind, workerContract, workerAssignment: input.workerAssignment || null,
    methodContract: input.methodContract || null, topologySessionId: input.topologySessionId || null
  }));
  return { workerId: input.workerId, created: true };
}

module.exports = { ensureTopologyWorker };
