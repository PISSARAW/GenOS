const { getDatabase } = require('../../db');
const { activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers, pendingWorkerRecoveries, pendingContinuations, emit, updateAgent, orchestratorToolLease } = require('../agentOrchestrationState');
const { processMatches, terminateChild } = require('../processTermination');
const orphanageService = require('../daemon/reconciliation/orphanageService');
const RUNTIME_DRAIN_GRACE_SECONDS = 30;

function recentActivityInterval() {
  return `-${RUNTIME_DRAIN_GRACE_SECONDS} seconds`;
}

async function markRuntimeTerminated(db, row, error = null) {
  const { id, runtime_pid, runtime_executable } = row;
  const updated = await db.run(
    `UPDATE agents SET status = 'terminated', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'running' AND runtime_pid = ? AND runtime_executable = ?
       AND NOT EXISTS (
         SELECT 1 FROM telemetry_events recent
         WHERE recent.agent_id = agents.id
           AND recent.created_at >= datetime('now', ?)
       )`,
    id, runtime_pid, runtime_executable, recentActivityInterval()
  );
  if (!updated.changes) return 0;
  const detail = error
    ? `Persisted runtime ${runtime_pid} for agent ${id} was confirmed dead; marked terminated.`
    : `Persisted runtime ${runtime_pid} did not match its recorded executable; marked terminated.`;
  emit(id, 'RUNTIME_RECONCILED', 'RECONCILE', detail, { runtime_pid, runtime_executable, ...(error ? { error: error.message } : {}) }, error ? 'info' : 'warning');
  return 1;
}

async function reconcilePersistedRuntimeRow(db, row) {
  const { id, status, runtime_pid, runtime_executable } = row;
  if (!runtime_pid || status !== 'running') return 0;
  // The child may already have exited while its owning supervisor is still
  // draining framed events. Revoking the agent here would invalidate those
  // already-emitted events. The SQL guard above also protects this boundary
  // when reconciliation runs from another process.
  if (activeProcesses.has(id)) return 0;
  // Vérifie d'abord que le PID existe toujours (signal 0 ne tue pas le process),
  // puis vérifie que le PID correspond bien à l'exécutable GenOS enregistré.
  // Un PID recyclé par le système aurait un exécutable différent → faux positif évité.
  try {
    process.kill(runtime_pid, 0);
    // processMatches retourne false si l'exécutable est inconnu ou ne correspond pas
    // → dans ce cas, le PID existe mais n'est pas le nôtre → marquer terminé
    if (processMatches(runtime_pid, runtime_executable)) return 0;
    return markRuntimeTerminated(db, row);
  } catch (err) {
    if (err.code !== 'ESRCH') return 0;
    return markRuntimeTerminated(db, row, err);
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

async function territoryProjection(db) {
  const columns = await db.all('PRAGMA table_info(agents)');
  return columns.some((column) => column.name === 'territory_id')
    ? 'a.territory_id' : 'NULL AS territory_id';
}

async function reconcileDeadOrchestratorChildren(db) {
  const territory = await territoryProjection(db);
  const orphans = await db.all(`
    SELECT a.id, a.parent_agent_id as former_parent_id, ${territory}
    FROM agents a
    WHERE a.parent_agent_id IN (
      SELECT id FROM agents WHERE execution_mode = 'orchestrator' AND (status IN ('apoptosis', 'terminated', 'error') OR is_apoptotic = 1)
    ) AND a.execution_mode = 'worker' AND a.status = 'running'
  `);
  if (!orphans.length) return 0;
  let admitted = 0;
  for (const orphan of orphans) {
    try {
      const result = await orphanageService.admitWorker(db, {
        workerId: orphan.id,
        territoryId: orphan.territory_id,
        formerParentId: orphan.former_parent_id,
        ttlMs: orphanageService.DEFAULT_ORPHAN_TTL_MS
      });
      if (result.admitted) admitted += 1;
    } catch (err) {
      console.error(`[MissionReconcile] Error admitting orphan ${orphan.id} to orphanage:`, err.message);
    }
    try {
      await db.run('UPDATE trinity_worlds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?', 'terminated', orphan.id);
    } catch (err) {
      console.error(`[MissionReconcile] Error updating trinity_worlds status for orphan ${orphan.id}:`, err.message);
    }
  }
  return admitted;
}

async function reconcileUntrackedWorkers(db) {
  const territory = await territoryProjection(db);
  const rows = await db.all(`SELECT a.id, a.parent_agent_id as former_parent_id, ${territory} FROM agents a
    WHERE a.execution_mode = 'worker' AND a.status = 'running' AND a.runtime_pid IS NULL
      AND NOT EXISTS (SELECT 1 FROM garage_queue q WHERE q.worker_id = a.id
        AND (q.status IN ('claimed','running')
          OR q.phase IN ('freezing','freeze_failed','frozen','thawing','cancelling')))
      AND NOT EXISTS (SELECT 1 FROM agents parent WHERE parent.id = a.parent_agent_id
        AND parent.status IN ('running','blocked'))`);
  let admitted = 0;
  for (const row of rows) {
    try {
      const result = await orphanageService.admitWorker(db, {
        workerId: row.id,
        territoryId: row.territory_id,
        formerParentId: row.former_parent_id,
        ttlMs: orphanageService.DEFAULT_ORPHAN_TTL_MS
      });
      if (!result.admitted) continue;
      admitted += 1;
    } catch (err) {
      console.error(`[MissionReconcile] Error admitting untracked worker ${row.id} to orphanage:`, err.message);
      continue;
    }
    emit(row.id, 'UNTRACKED_WORKER_RECONCILED', 'RECONCILE',
      `Untracked worker ${row.id} has no active parent, runtime PID, or garage lease; admitted to orphanage.`,
      {}, 'warning');
  }
  return admitted;
}

async function reconcilePersistedRuntimes(db) {
  const rows = await db.all("SELECT id, status, runtime_pid, runtime_executable FROM agents WHERE status = 'running' AND runtime_pid IS NOT NULL");
  let reconciled = 0;
  for (const row of rows) {
    reconciled += await reconcilePersistedRuntimeRow(db, row);
  }

  reconciled += await reconcileDeadOrchestratorChildren(db);
  reconciled += await reconcileOrphanedRunning(db);
  reconciled += await reconcileUntrackedWorkers(db);

  return reconciled;
}

async function resumeDurableWorkerRecoveries(db) {
  return require('../agentRecovery/dispatchWorkerRecovery').resumeDurableWorkerRecoveries(db);
}

module.exports = { reconcileDeadOrchestratorChildren, reconcilePersistedRuntimes,
  reconcilePersistedRuntimeRow, reconcileOrphanedRunning, reconcileUntrackedWorkers,
  resumeDurableWorkerRecoveries, RUNTIME_DRAIN_GRACE_SECONDS };
