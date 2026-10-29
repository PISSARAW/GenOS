'use strict';

async function getWorkerStatusForMember(db, options = {}, access) {
  const { orchestratorId, requesterAgentId, workerId, limit = 50 } = options;
  await access.assertOrchestrator(db, orchestratorId);
  await access.assertMember(db, orchestratorId, requesterAgentId);
  const boundedLimit = Math.min(50, Math.max(1, Number(limit) || 50));
  const workers = workerId
    ? await fetchOneWorker(db, orchestratorId, workerId)
    : await fetchWorkers(db, orchestratorId, boundedLimit);
  return { orchestratorId, workers };
}

function fetchOneWorker(db, orchestratorId, workerId) {
  return db.all(
    `SELECT id as workerId, name, role, status, updated_at as updatedAt
       FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' AND id = ? LIMIT 1`,
    orchestratorId, workerId
  );
}

function fetchWorkers(db, orchestratorId, limit) {
  return db.all(
    `SELECT id as workerId, name, role, status, updated_at as updatedAt
       FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker'
      ORDER BY name ASC, id ASC LIMIT ?`,
    orchestratorId, limit
  );
}

module.exports = { getWorkerStatusForMember };
