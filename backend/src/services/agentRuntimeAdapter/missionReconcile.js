const { getDatabase } = require('../../db');
const { activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers, pendingWorkerRecoveries, pendingContinuations, emit, updateAgent, orchestratorToolLease } = require('../agentOrchestrationState');
const { processMatches, terminateChild } = require('../processTermination');

async function reconcilePersistedRuntimeRow(db, row) {
  const { id, status, runtime_pid, runtime_executable } = row;
  if (!runtime_pid) return 0;
  // Vérifie d'abord que le PID existe toujours (signal 0 ne tue pas le process),
  // puis vérifie que le PID correspond bien à l'exécutable GenOS enregistré.
  // Un PID recyclé par le système aurait un exécutable différent → faux positif évité.
  try {
    process.kill(runtime_pid, 0);
    // processMatches retourne false si l'exécutable est inconnu ou ne correspond pas
    // → dans ce cas, le PID existe mais n'est pas le nôtre → marquer terminé
    if (processMatches(runtime_pid, runtime_executable)) return 0;
    const updated = await db.run(
      `UPDATE agents SET status = 'terminated', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      id
    );
    if (updated.changes) {
      emit(id, 'RUNTIME_RECONCILED', 'RECONCILE', `Persisted runtime ${runtime_pid} did not match its recorded executable; marked terminated.`, { runtime_pid, runtime_executable }, 'warning');
      return 1;
    }
    return 0;
  } catch (err) {
    // PID inaccessible (processus mort ou privilèges insuffisants) → supposer terminé
    const updated = await db.run(
      `UPDATE agents SET status = 'terminated', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      id
    );
    if (updated.changes) {
      emit(id, 'RUNTIME_RECONCILED', 'RECONCILE', `Persisted runtime ${runtime_pid} for agent ${id} was dead or unreachable; marked terminated.`, { runtime_pid, runtime_executable, error: err.message }, 'info');
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
      if (processMatches(runtime_pid, runtime_executable)) continue;
      await db.run(
        `UPDATE agents SET status = 'terminated', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        id
      );
      emit(id, 'ORPHAN_RECONCILED', 'RECONCILE', `Orphaned orchestrator ${id} (pid ${runtime_pid}) did not match its recorded executable; marked terminated.`, { runtime_pid, runtime_executable, workspace_id }, 'warning');
      reconciled++;
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
    try {
      await db.run('UPDATE trinity_worlds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?', 'terminated', orphan.id);
    } catch (err) {
      console.error(`[MissionReconcile] Error updating trinity_worlds status for orphan ${orphan.id}:`, err.message);
    }
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
