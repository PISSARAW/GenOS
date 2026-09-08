/**
 * GenOS Trajectories & Code Proposals Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const crypto = require('crypto');
const path = require('path');

function workspaceScope(req, alias = 'w') {
  const prefix = alias ? `${alias}.` : '';
  return req.tenant
    ? { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: `${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL`, params: [] };
}

async function findScopedTrajectory(db, req, id) {
  const scope = workspaceScope(req);
  return db.get(
    `SELECT t.* FROM trajectories t JOIN workspaces w ON w.id = t.workspace_id WHERE t.id = ? AND ${scope.clause}`,
    id,
    ...scope.params
  );
}

async function formatTrajectory(t) {
  let diffLines = [];
  try {
    diffLines = JSON.parse(t.diff_lines || '[]');
  } catch (e) {}

  return {
    id: t.id,
    author: t.author_name || 'GenOS Architect',
    title: t.title,
    status: t.status,
    confidence: t.confidence,
    summary: t.semantic_summary,
    qaFeedback: t.qa_feedback,
    diffFile: t.diff_file || null,
    diffStats: t.diff_stats || null,
    diffLines,
    adversarialResult: t.adversarial_result || null,
    futureCiResult: t.future_ci_result || null,
    isExceptional: !!t.is_exceptional,
    createdAt: t.created_at
  };
}

async function getTrajectories(req, res) {
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const allRows = await db.all(
    `SELECT t.* FROM trajectories t JOIN workspaces w ON w.id = t.workspace_id WHERE ${scope.clause} ORDER BY t.created_at DESC`,
    ...scope.params
  );

  const pendingList = [];
  const activeList = [];

  for (const r of allRows) {
    const formatted = await formatTrajectory(r);
    if (r.status === 'pending') {
      pendingList.push(formatted);
    } else {
      activeList.push(formatted);
    }
  }

  res.json({ pendingList, activeList });
}

async function getPending(req, res) {
  const db = await getDatabase();
  const workspaceId = String(req.query.workspaceId || '').trim();
  const scope = workspaceScope(req);
  const workspace = workspaceId
    ? await db.get(`SELECT id FROM workspaces WHERE (id = ? OR name = ?) AND ${scope.clause}`, workspaceId, workspaceId, ...scope.params)
    : null;
  const rows = workspaceId
    ? await db.all(`SELECT t.* FROM trajectories t JOIN workspaces w ON w.id = t.workspace_id WHERE t.status = 'pending' AND t.workspace_id = ? AND ${scope.clause} ORDER BY t.created_at DESC`, workspace?.id || workspaceId, ...scope.params)
    : await db.all(`SELECT t.* FROM trajectories t JOIN workspaces w ON w.id = t.workspace_id WHERE t.status = 'pending' AND ${scope.clause} ORDER BY t.created_at DESC`, ...scope.params);
  const result = await Promise.all(rows.map(r => formatTrajectory(r)));
  res.json(result);
}

async function getActive(req, res) {
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const rows = await db.all(`SELECT t.* FROM trajectories t JOIN workspaces w ON w.id = t.workspace_id WHERE t.status = 'active' AND ${scope.clause} ORDER BY t.created_at DESC`, ...scope.params);
  const result = await Promise.all(rows.map(r => formatTrajectory(r)));
  res.json(result);
}

async function createTrajectory(req, res) {
  const { title, summary, diffFile, diffLines, authorName = 'worker_backend', workspaceId = 'ws-genos-core' } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: { code: 'INVALID_TITLE', message: 'A proposal title is required.' } });
  if (typeof summary !== 'string' || !summary.trim()) return res.status(400).json({ error: { code: 'INVALID_SUMMARY', message: 'A proposal summary is required.' } });
  if (!Array.isArray(diffLines) || diffLines.length === 0) return res.status(400).json({ error: { code: 'INVALID_DIFF', message: 'A non-empty diffLines array is required.' } });
  if (typeof diffFile !== 'string' || !diffFile.trim() || path.isAbsolute(diffFile) || diffFile.split(/[\\/]/).includes('..')) {
    return res.status(400).json({ error: { code: 'INVALID_DIFF_FILE', message: 'diffFile must be a relative path inside the workspace.' } });
  }
  const id = `traj-${crypto.randomUUID()}`;

  const db = await getDatabase();
  const scope = workspaceScope(req);
  const workspace = await db.get(`SELECT id FROM workspaces WHERE id = ? AND ${scope.clause}`, workspaceId, ...scope.params);
  if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace '${workspaceId}' is not available in this project.` } });
  await db.run(
    `INSERT INTO trajectories (id, workspace_id, author_name, title, status, semantic_summary, diff_file, diff_lines, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workspaceId, authorName, title.trim(), 'pending', summary.trim(), diffFile.trim(), JSON.stringify(diffLines), 0
  );

  telemetry.emitEvent({
    eventType: 'TRAJECTORY_SUBMITTED',
    agentId: authorName,
    action: 'PROPOSE',
    detail: `New code trajectory submitted: ${title}`,
    severity: 'info'
  });

  res.status(201).json({ success: true, trajectoryId: id });
}

async function approveTrajectory(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const trajectory = await findScopedTrajectory(db, req, id);
  if (!trajectory) return res.status(404).json({ error: { code: 'TRAJECTORY_NOT_FOUND', message: `Trajectory '${id}' was not found in this project.` } });
  if (!['pending', 'active'].includes(trajectory.status)) return res.status(409).json({ error: { code: 'INVALID_TRAJECTORY_STATE', message: `Trajectory '${id}' cannot be approved from '${trajectory.status}'.` } });
  return res.status(501).json({
    error: {
      code: 'TRAJECTORY_MERGE_NOT_IMPLEMENTED',
      message: 'Approval is disabled until an authenticated validation and repository merge executor is available.'
    },
    trajectoryId: id,
    status: trajectory.status,
    mutated: false
  });
}

async function rejectTrajectory(req, res) {
  const { id } = req.params;
  const { reason = 'Code rejected by operator' } = req.body || {};

  const db = await getDatabase();
  const trajectory = await findScopedTrajectory(db, req, id);
  if (!trajectory) return res.status(404).json({ error: { code: 'TRAJECTORY_NOT_FOUND', message: `Trajectory '${id}' was not found in this project.` } });
  if (!['pending', 'active', 'revising'].includes(trajectory.status)) return res.status(409).json({ error: { code: 'INVALID_TRAJECTORY_STATE', message: `Trajectory '${id}' cannot be rejected from '${trajectory.status}'.` } });
  await db.run("UPDATE trajectories SET status = 'rejected', qa_feedback = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?", reason, id, trajectory.status);

  telemetry.emitEvent({
    eventType: 'TRAJECTORY_REJECTED',
    agentId: 'operator',
    action: 'REJECT',
    detail: `Trajectory ${id} rejected. Reason: ${reason}`,
    severity: 'warning'
  });

  res.json({ success: true, message: `Trajectory ${id} rejected.` });
}

async function reviseTrajectory(req, res) {
  const { id } = req.params;
  const { notes = 'Revision requested' } = req.body || {};

  const db = await getDatabase();
  const trajectory = await findScopedTrajectory(db, req, id);
  if (!trajectory) return res.status(404).json({ error: { code: 'TRAJECTORY_NOT_FOUND', message: `Trajectory '${id}' was not found in this project.` } });
  if (!['pending', 'active', 'rejected'].includes(trajectory.status)) return res.status(409).json({ error: { code: 'INVALID_TRAJECTORY_STATE', message: `Trajectory '${id}' cannot be revised from '${trajectory.status}'.` } });
  await db.run("UPDATE trajectories SET status = 'revising', qa_feedback = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?", notes, id, trajectory.status);

  telemetry.emitEvent({
    eventType: 'TRAJECTORY_REVISE',
    agentId: 'operator',
    action: 'REVISE',
    detail: `Revision requested for trajectory ${id}: ${notes}`,
    severity: 'info'
  });

  res.json({ success: true, message: `Revision requested for trajectory ${id}.` });
}

module.exports = {
  getTrajectories,
  getPending,
  getActive,
  createTrajectory,
  approveTrajectory,
  rejectTrajectory,
  reviseTrajectory
};
