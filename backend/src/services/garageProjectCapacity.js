'use strict';

async function countActive(db, scope) {
  const row = await db.get(`WITH RECURSIVE worker_scope(worker_id, parent_id, workspace_id, depth) AS (
    SELECT a.id, a.parent_agent_id, a.workspace_id, 0 FROM agents a
    WHERE a.execution_mode = 'worker'
      AND (a.status = 'running'
        OR (a.status = 'blocked' AND a.current_task = 'Stopping on operator request')
        OR EXISTS (SELECT 1 FROM garage_queue q WHERE q.worker_id = a.id
          AND (q.phase IN ('freezing','freeze_failed','cancelling')
            OR (q.status IN ('claimed','running') AND q.phase = 'ready'))))
    UNION ALL
    SELECT s.worker_id, p.parent_agent_id, p.workspace_id, s.depth + 1
    FROM worker_scope s JOIN agents p ON p.id = s.parent_id
    WHERE s.workspace_id IS NULL AND s.depth < 32
  )
  SELECT COUNT(DISTINCT s.worker_id) AS count FROM worker_scope s
  JOIN workspaces w ON w.id = s.workspace_id
  WHERE w.organization_id = ? AND w.project_id = ?`, scope.organization_id, scope.project_id);
  return Number(row?.count || 0);
}

module.exports = { countActive };
