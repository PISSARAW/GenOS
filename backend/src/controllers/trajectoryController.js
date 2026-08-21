/**
 * GenOS Trajectories & Code Proposals Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

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
    diffFile: t.diff_file || 'src/index.ts',
    diffStats: t.diff_stats || '+10, -5',
    diffLines,
    adversarialResult: t.adversarial_result || 'Passed (0 CVEs)',
    futureCiResult: t.future_ci_result || 'Clean',
    isExceptional: !!t.is_exceptional,
    createdAt: t.created_at
  };
}

async function getTrajectories(req, res) {
  const db = await getDatabase();
  const allRows = await db.all('SELECT * FROM trajectories ORDER BY created_at DESC');

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
  const rows = await db.all("SELECT * FROM trajectories WHERE status = 'pending' ORDER BY created_at DESC");
  const result = await Promise.all(rows.map(r => formatTrajectory(r)));
  res.json(result);
}

async function getActive(req, res) {
  const db = await getDatabase();
  const rows = await db.all("SELECT * FROM trajectories WHERE status = 'active' ORDER BY created_at DESC");
  const result = await Promise.all(rows.map(r => formatTrajectory(r)));
  res.json(result);
}

async function createTrajectory(req, res) {
  const { title, summary, diffFile, diffLines, authorName = 'worker_backend', workspaceId = 'ws-genos-core' } = req.body || {};
  const id = `traj-${Date.now()}`;

  const db = await getDatabase();
  await db.run(
    `INSERT INTO trajectories (id, workspace_id, author_name, title, status, semantic_summary, diff_file, diff_lines, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workspaceId, authorName, title || 'Autonomous Code Proposal', 'pending', summary || '', diffFile || 'src/app.ts', JSON.stringify(diffLines || []), 95
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
  await db.run("UPDATE trajectories SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", id);

  telemetry.emitEvent({
    eventType: 'TRAJECTORY_APPROVED',
    agentId: 'operator',
    action: 'APPROVE',
    detail: `Trajectory ${id} approved and merged into workspace master`,
    severity: 'info'
  });

  res.json({ success: true, message: `Trajectory ${id} approved and merged.` });
}

async function rejectTrajectory(req, res) {
  const { id } = req.params;
  const { reason = 'Code rejected by operator' } = req.body || {};

  const db = await getDatabase();
  await db.run("UPDATE trajectories SET status = 'rejected', qa_feedback = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", reason, id);

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
  await db.run("UPDATE trajectories SET status = 'revising', qa_feedback = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", notes, id);

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
