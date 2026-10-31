'use strict';

async function record(db, input) {
  const code = input.error.code || 'DELEGATED_CHILD_PREPARATION_FAILED';
  const changed = await db.run(`UPDATE agents SET status = 'error', current_task = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND parent_agent_id = ? AND status = 'idle'
    AND runtime_pid IS NULL AND NOT EXISTS
      (SELECT 1 FROM strategy_execution_runs WHERE agent_id = agents.id)`,
  `${code}: ${input.error.message}`, input.child.agentId, input.parentId);
  if (changed.changes !== 1) return;
  const garage = require('../workerGarageService');
  await garage.releaseStaleWorkerClaims(db, input.child.agentId);
  await garage.releaseSlot(db, { workerId: input.child.agentId, orchestratorId: input.parentId });
  require('../agentOrchestrationState').emit(input.child.agentId,
    'DELEGATED_CHILD_PREPARATION_FAILED', 'PREPARE_CHILD', input.error.message,
    { parentAgentId: input.parentId, childId: input.child.agentId, code,
      started: false, workspacePreserved: true }, 'error', 'error');
}

module.exports = { record };
