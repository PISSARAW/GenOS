const { getDatabase } = require('../../db');
const { activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers, pendingWorkerRecoveries, pendingContinuations, emit, updateAgent, orchestratorToolLease } = require('../agentOrchestrationState');
const { terminateChild } = require('../processTermination');

async function reconcilePersistedRuntimeRow(db, row) {
  const { id, status, runtime_pid, runtime_executable } = row;
  if (!runtime_pid) return 0;
  try {
    process.kill(runtime_pid, 0);
    return 0;
  } catch (_) {
    const updated = await db.run(
      `UPDATE agents SET status = 'terminated', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      id
    );
    if (updated.changes) {
      emit(id, 'RUNTIME_RECONCILED', 'RECONCILE', `Persisted runtime ${runtime_pid} for agent ${id} was dead; marked terminated.`, { runtime_pid, runtime_executable }, 'info');
      return 1;
    }
    return 0;
  }
}

async function reconcileOrphanedRunning(db) {
  const rows = await db.all(
    `SELECT a.id, a.runtime_pid, a.runtime_executable, a.workspace_id
     FROM agents a
     WHERE a.status = 'running'
       AND a.runtime_pid IS NOT NULL
       AND a.execution_mode = 'orchestrator'
       AND NOT EXISTS (
         SELECT 1 FROM agents parent
         WHERE parent.id = a.parent_agent_id
           AND parent.status IN ('running', 'blocked', 'idle')
       )`
  );
  let reconciled = 0;
  for (const row of rows) {
    const { id, runtime_pid, runtime_executable, workspace_id } = row;
    if (!runtime_pid) continue;
    try {
      process.kill(runtime_pid, 0);
      continue;
    } catch (_) {
      await db.run(
        `UPDATE agents SET status = 'terminated', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        id
      );
      emit(id, 'ORPHAN_RECONCILED', 'RECONCILE', `Orphaned orchestrator ${id} (pid ${runtime_pid}) was dead; marked terminated.`, { runtime_pid, workspace_id }, 'info');
      reconciled++;
    }
  }
  return reconciled;
}

async function reconcileDeadOrchestratorChildren(db) {
  const orphans = await db.all(`
    SELECT id FROM agents
    WHERE parent_agent_id IN (
      SELECT id FROM agents WHERE execution_mode = 'orchestrator' AND (status IN ('apoptosis', 'terminated', 'error') OR is_apoptotic = 1)
    ) AND execution_mode = 'worker' AND status = 'running'
  `);
  if (!orphans.length) return 0;
  await db.run(`
    UPDATE agents
    SET status = 'terminated', current_task = 'Terminated following parent orchestrator termination/apoptosis',
        runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE parent_agent_id IN (
      SELECT id FROM agents WHERE execution_mode = 'orchestrator' AND (status IN ('apoptosis', 'terminated', 'error') OR is_apoptotic = 1)
    ) AND execution_mode = 'worker' AND status = 'running'
  `);
  for (const orphan of orphans) {
    await db.run('UPDATE trinity_worlds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?', 'terminated', orphan.id).catch(() => {});
  }
  return orphans.length;
}

async function reconcilePersistedRuntimes(db) {
  const rows = await db.all("SELECT id, status, runtime_pid, runtime_executable FROM agents WHERE status != 'terminated' AND runtime_pid IS NOT NULL");
  let reconciled = 0;
  for (const row of rows) {
    reconciled += await reconcilePersistedRuntimeRow(db, row);
  }

  reconciled += await reconcileDeadOrchestratorChildren(db);
  reconciled += await reconcileOrphanedRunning(db);

  return reconciled;
}

module.exports = { reconcileDeadOrchestratorChildren, reconcilePersistedRuntimes, reconcilePersistedRuntimeRow, reconcileOrphanedRunning };