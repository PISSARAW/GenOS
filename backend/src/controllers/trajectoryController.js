/**
 * GenOS Trajectories & Code Proposals Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { normalizeRelativePath, resolveContainedPathNoSymlinkSync } = require('../services/pathSafety');
const { isPathWithinRoot, resolveWorkspacesRoot } = require('../services/workspaceRegistry');

const WORKSPACES_ROOT = resolveWorkspacesRoot();

function isDeletionKind(kind) {
  return kind ? ['deletion', 'del', 'remove', 'removed'].includes(kind) : false;
}

function cleanLineText(text) {
  return text.startsWith('+') || text.startsWith('-') || text.startsWith(' ') ? text.slice(1) : text;
}

function extractLineText(raw) {
  return String((raw && (raw.content ?? raw.text)) ?? raw ?? '');
}

function normalizeKind(raw) {
  return String((raw && (raw.type || raw.kind)) || '').toLowerCase();
}

function processDiffLine(raw) {
  const kind = normalizeKind(raw);
  let text = extractLineText(raw);
  if (isDeletionKind(kind)) return null;
  if (!kind && /^[+\- ]/.test(text)) text = text.slice(1);
  return text;
}

function reconstructFileContent(diffLines) {
  const kept = diffLines.map(processDiffLine).filter(Boolean);
  return kept.length ? `${kept.join('\n')}\n` : '';
}

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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isValidDiffFile(diffFile) {
  return isNonEmptyString(diffFile) && !path.isAbsolute(diffFile) && !diffFile.split(/[\\/]/).includes('..');
}

function validateTrajectoryInput({ title, summary, diffLines, diffFile }) {
  if (!isNonEmptyString(title)) return { error: { code: 'INVALID_TITLE', message: 'A proposal title is required.' } };
  if (!isNonEmptyString(summary)) return { error: { code: 'INVALID_SUMMARY', message: 'A proposal summary is required.' } };
  if (!isNonEmptyArray(diffLines)) return { error: { code: 'INVALID_DIFF', message: 'A non-empty diffLines array is required.' } };
  if (!isValidDiffFile(diffFile)) return { error: { code: 'INVALID_DIFF_FILE', message: 'diffFile must be a relative path inside the workspace.' } };
  return null;
}

async function createTrajectoryRecord(db, { id, workspaceId, authorName, title, summary, diffFile, diffLines }) {
  await db.run(
    `INSERT INTO trajectories (id, workspace_id, author_name, title, status, semantic_summary, diff_file, diff_lines, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workspaceId, authorName, title.trim(), 'pending', summary.trim(), diffFile.trim(), JSON.stringify(diffLines), 0
  );
}

async function createTrajectory(req, res) {
  const { title, summary, diffFile, diffLines, authorName = 'worker_backend', workspaceId = 'ws-genos-core' } = req.body || {};
  const validationError = validateTrajectoryInput({ title, summary, diffLines, diffFile });
  if (validationError) return res.status(400).json(validationError);

  const id = `traj-${crypto.randomUUID()}`;
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const workspace = await db.get(`SELECT id FROM workspaces WHERE id = ? AND ${scope.clause}`, workspaceId, ...scope.params);
  if (!workspace) return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace '${workspaceId}' is not available in this project.` } });

  await createTrajectoryRecord(db, { id, workspaceId, authorName, title, summary, diffFile, diffLines });

  telemetry.emitEvent({
    eventType: 'TRAJECTORY_SUBMITTED',
    agentId: authorName,
    action: 'PROPOSE',
    detail: `New code trajectory submitted: ${title}`,
    severity: 'info'
  });

  res.status(201).json({ success: true, trajectoryId: id });
}

function parseDiffLines(diffLinesJson) {
  try { return JSON.parse(diffLinesJson || '[]'); } catch (_) { return []; }
}

function validateDiffLines(diffLines) {
  return Array.isArray(diffLines) && diffLines.length > 0;
}

async function validateWorkspaceForTrajectory(db, trajectory) {
  const workspace = await db.get('SELECT id, path FROM workspaces WHERE id = ?', trajectory.workspace_id);
  if (!workspace || !workspace.path || !isPathWithinRoot(WORKSPACES_ROOT, workspace.path)) {
    return { error: { code: 'WORKSPACE_UNAVAILABLE', message: `Workspace for trajectory is not available on disk for merge.` } };
  }
  return { workspace };
}

function resolveDiffDestination(workspacePath, diffFile) {
  const relativePath = normalizeRelativePath(diffFile || '', 'diffFile');
  const destination = resolveContainedPathNoSymlinkSync(workspacePath, relativePath, 'diffFile');
  return { relativePath, destination };
}

function buildCommitMessage(id, title) {
  return `[Trajectory ${id}] ${title}`.slice(0, 200);
}

async function attemptGitCommit(workspacePath, relativePath, message) {
  const commit = { attempted: false, committed: false };
  try {
    await execFileAsync('git', ['-C', workspacePath, 'rev-parse', '--is-inside-work-tree'], { timeout: 5000 });
    commit.attempted = true;
    await execFileAsync('git', ['-C', workspacePath, 'add', '--', relativePath], { timeout: 5000 });
    await execFileAsync('git', ['-C', workspacePath, 'commit', '-m', message, '--', relativePath], { timeout: 10000 });
    const { stdout } = await execFileAsync('git', ['-C', workspacePath, 'rev-parse', 'HEAD'], { timeout: 5000 });
    commit.committed = true;
    commit.sha = stdout.trim();
    commit.message = message;
  } catch (error) {
    commit.reason = String(error.message || error).split('\n')[0];
  }
  return commit;
}

async function applyDiffContent(destination, diffLines) {
  const content = reconstructFileContent(diffLines);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, content, 'utf8');
}

async function approveTrajectory(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const trajectory = await findScopedTrajectory(db, req, id);
  if (!trajectory) return res.status(404).json({ error: { code: 'TRAJECTORY_NOT_FOUND', message: `Trajectory '${id}' was not found in this project.` } });
  if (!['pending', 'active'].includes(trajectory.status)) return res.status(409).json({ error: { code: 'INVALID_TRAJECTORY_STATE', message: `Trajectory '${id}' cannot be approved from '${trajectory.status}'.` } });

  const workspaceValidation = await validateWorkspaceForTrajectory(db, trajectory);
  if (workspaceValidation.error) return res.status(409).json(workspaceValidation.error);
  const workspace = workspaceValidation.workspace;

  const diffLines = parseDiffLines(trajectory.diff_lines);
  if (!validateDiffLines(diffLines)) return res.status(422).json({ error: { code: 'EMPTY_DIFF', message: `Trajectory '${id}' has no diff content to merge.` } });

  const { relativePath, destination } = resolveDiffDestination(workspace.path, trajectory.diff_file);
  await applyDiffContent(destination, diffLines);

  const message = buildCommitMessage(id, trajectory.title);
  const commit = await attemptGitCommit(workspace.path, relativePath, message);

  await db.run("UPDATE trajectories SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?", id, trajectory.status);

  telemetry.emitEvent({
    eventType: 'TRAJECTORY_APPROVED',
    agentId: 'operator',
    action: 'APPROVE',
    detail: `Trajectory ${id} approved and merged into ${relativePath}${commit.committed ? ` (commit ${commit.sha.slice(0, 8)})` : ''}.`,
    severity: 'info'
  });

  res.json({ success: true, trajectoryId: id, status: 'active', mutated: true, mergedFile: relativePath, commit });
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
