const { processMatches, terminatePid } = require('../processTermination');

// Reconciliation writes agents directly, so it must mirror the status onto the
// linked trinity world; otherwise a dead world keeps reporting `running`.
async function syncTrinityWorldStatus(db, agentId, status) {
  await db.run(
    'UPDATE trinity_worlds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?',
    status, agentId
  ).catch(() => {});
}

async function reconcilePersistedRuntimeRow(db, row) {
  let alive = true;
  try { process.kill(Number(row.runtime_pid), 0); } catch (_) { alive = false; }
  const matches = alive && processMatches(row.runtime_pid, row.runtime_executable);
  if (alive && matches) terminatePid(row.runtime_pid);
  if (row.status === 'apoptosis') {
    await db.run("UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, is_apoptotic = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", row.id);
  } else if (!alive || !matches) {
    await db.run("UPDATE agents SET status = 'error', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", alive ? 'Runtime PID was reused by another executable.' : 'Runtime disappeared before shutdown reconciliation', row.id);
    await syncTrinityWorldStatus(db, row.id, 'error');
    return 1;
  } else {
    await db.run("UPDATE agents SET status = 'blocked', runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, current_task = 'Orphaned runtime terminated during startup reconciliation', updated_at = CURRENT_TIMESTAMP WHERE id = ?", row.id);
    await syncTrinityWorldStatus(db, row.id, 'blocked');
    return 1;
  }
  return 0;
}

async function reconcileDeadOrchestratorWorkers(db) {
  const result = await db.run(`
    UPDATE agents
    SET status = 'terminated', current_task = 'Terminated following parent orchestrator termination/apoptosis',
        runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE parent_agent_id IN (
      SELECT id FROM agents WHERE execution_mode = 'orchestrator' AND (status IN ('apoptosis', 'terminated', 'completed', 'error') OR is_apoptotic = 1)
    ) AND execution_mode = 'worker' AND status IN ('running', 'blocked')
  `);
  return result?.changes || 0;
}

async function reconcileOrphanedRunning(db) {
  const orphans = await db.all("SELECT id FROM agents WHERE status = 'running' AND (runtime_pid IS NULL OR runtime_pid = '')");
  if (!orphans.length) return 0;
  await db.run(`
    UPDATE agents
    SET status = 'error', current_task = 'Orphaned runtime without PID reconciled', runtime_pid = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running' AND (runtime_pid IS NULL OR runtime_pid = '')
  `);
  for (const orphan of orphans) await syncTrinityWorldStatus(db, orphan.id, 'error');
  return orphans.length;
}

module.exports = { reconcilePersistedRuntimeRow, reconcileDeadOrchestratorWorkers, reconcileOrphanedRunning };
