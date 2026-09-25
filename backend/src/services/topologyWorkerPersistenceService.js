'use strict';

const workerKinds = require('./agents/workerKindService');

async function ensureTopologyWorker(db, input) {
  const workerKind = workerKinds.resolveWorkerKind(input.workerKind, input.role);
  const workerContract = workerKinds.buildWorkerContract(workerKind, {
    prompt: input.mission,
    orchestratorAgentId: input.parentId
  });
  const existing = await db.get('SELECT id, parent_agent_id, execution_mode, role FROM agents WHERE id = ?', input.workerId);
  if (existing) return validateExistingWorker(existing, input);
  return insertTopologyWorker({ db, input, workerKind, workerContract });
}

function validateExistingWorker(existing, input) {
  const valid = existing.parent_agent_id === input.parentId
    && existing.execution_mode === 'worker'
    && existing.role === input.role;
  if (!valid) throw Object.assign(new Error(`Worker identity '${input.workerId}' conflicts with an existing agent.`), { code: 'TOPOLOGY_WORKER_IDENTITY_CONFLICT' });
  return { workerId: input.workerId, created: false };
}

async function insertTopologyWorker({ db, input, workerKind, workerContract }) {
  await db.run(`INSERT INTO agents
    (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, isolation_mode, parent_agent_id, about, current_task, metadata_json)
    VALUES (?, ?, ?, 'idle', 'GenOS', 'worker', ?, ?, ?, ?, ?, ?, ?)`,
  input.workerId, input.name || input.role, input.role || 'worker', input.workspaceId || null,
  input.modelTier || 'standard', input.isolationMode || 'Branch', input.parentId,
  `Worker scope: ${input.mission || ''}`,
  input.mission || '', JSON.stringify({ workerKind, workerContract }));
  return { workerId: input.workerId, created: true };
}

module.exports = { ensureTopologyWorker };
