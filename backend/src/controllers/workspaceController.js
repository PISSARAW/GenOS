/**
 * GenOS Workspaces & Time Machine Controller
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const snapshotStore = require('../services/workspaceSnapshotStore');
const {
  isPathWithinRoot,
  resolveWorkspacesRoot,
} = require('../services/workspaceRegistry');
const execFileAsync = promisify(execFile);

const WORKSPACES_ROOT = resolveWorkspacesRoot();

async function findWorkspace(db, req, reference) {
  let workspace;
  if (req.tenant) {
    workspace = await db.get(
      'SELECT * FROM workspaces WHERE (id = ? OR name = ?) AND organization_id = ? AND project_id = ?',
      reference,
      reference,
      req.tenant.organizationId,
      req.tenant.projectId
    );
  } else {
    workspace = await db.get('SELECT * FROM workspaces WHERE (id = ? OR name = ?) AND organization_id IS NULL AND project_id IS NULL', reference, reference);
  }
  return workspace && isPathWithinRoot(WORKSPACES_ROOT, workspace.path) ? workspace : null;
}

async function getWorkspaceFiles(req, res) {
  const db = await getDatabase();
  const requestedId = String(req.params.id || '').trim();
  const workspace = await findWorkspace(db, req, requestedId);
  if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${requestedId}` } });

  const workspacePath = workspace.path;
  const ignored = new Set(['.git', 'node_modules', 'dist', 'target', '.next', 'coverage']);
  const files = [];
  const walk = (directory, relative = '') => {
    if (!fs.existsSync(directory) || files.length >= 250) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith('.') || entry.name.startsWith('genos.db')) continue;
      const absolute = path.join(directory, entry.name);
      const filePath = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(absolute, filePath);
      else files.push({ name: filePath.replaceAll(path.sep, '/'), type: 'file', message: 'Workspace file', time: fs.statSync(absolute).mtime.toISOString() });
      if (files.length >= 250) return;
    }
  };

  try { walk(workspacePath); } catch (error) { return res.status(500).json({ error: { code: 'FILES_UNAVAILABLE', message: error.message } }); }

  let statusByFile = {};
  try {
    const { stdout } = await execFileAsync('git', ['-C', workspacePath, 'status', '--short'], { timeout: 5000, maxBuffer: 1024 * 1024 });
    statusByFile = Object.fromEntries(stdout.split('\n').filter(Boolean).map(line => {
      const code = line.slice(0, 2).trim() || 'modified';
      return [line.slice(3).trim(), code];
    }));
  } catch (_) {}

  const readmePath = ['README.md', 'readme.md'].map(name => path.join(workspacePath, name)).find(fs.existsSync);
  let readme = '';
  if (readmePath) { try { readme = fs.readFileSync(readmePath, 'utf8').slice(0, 20000); } catch (_) {} }
  const enrichedFiles = files
    .map(file => ({ ...file, status: statusByFile[file.name] || 'clean' }))
    .filter(file => file.status !== 'clean')
    .sort((a, b) => {
      const aChanged = a.status === 'clean' ? 1 : 0;
      const bChanged = b.status === 'clean' ? 1 : 0;
      return aChanged - bChanged || a.name.localeCompare(b.name);
    });
  res.json({ workspace: { id: workspace.id, name: workspace.name, path: workspacePath }, files: enrichedFiles, readme });
}

async function listWorkspaces(req, res) {
  const db = await getDatabase();
  const dbWorkspaces = req.tenant
    ? await db.all('SELECT * FROM workspaces WHERE organization_id = ? AND project_id = ? ORDER BY updated_at DESC', req.tenant.organizationId, req.tenant.projectId)
    : await db.all('SELECT * FROM workspaces WHERE organization_id IS NULL AND project_id IS NULL ORDER BY updated_at DESC');

  const result = await Promise.all(dbWorkspaces.map(async (w) => {
    let tags = [];
    try {
      tags = JSON.parse(w.tags || '[]');
    } catch (e) {}

    const categories = [];
    if (w.is_archived) {
      categories.push('Archived/Sleeping Workspaces');
    } else {
      categories.push('Active Swarms (Supervised)');
    }

    const agentCount = await db.get(
      "SELECT COUNT(*) as count FROM agents WHERE workspace_id = ? AND status = 'running'",
      w.id
    );
    if (w.name.includes('-fork') || w.name.includes('_fork')) {
      categories.push('Experimental Timelines (Forks)');
    } else {
      categories.push('Root Universes');
    }

    return {
      id: w.id,
      title: w.name,
      name: w.name,
      path: w.path,
      visibility: w.visibility || 'Private',
      tags,
      snapshots: (await db.get('SELECT COUNT(*) as count FROM workspace_snapshots WHERE workspace_id = ?', w.id))?.count || 0,
      agents: `${agentCount?.count || 0} Active`,
      trajectories: (await db.get('SELECT COUNT(*) as count FROM trajectories WHERE workspace_id = ?', w.id))?.count || 0,
      anomalies: w.anomalies_count || 0,
      updated: w.updated_at || w.created_at || null,
      language: w.language || 'TypeScript',
      activityColor: w.anomalies_count > 0 ? '#cf222e' : '#0969da',
      activityData: [],
      categories,
      description: w.description || `Workspace for ${w.name}`
    };
  }));

  res.json(result);
}

async function createWorkspace(req, res) {
  const { name, language = 'TypeScript', description = '', visibility = 'Private' } = req.body || {};
  if (!name || path.basename(name) !== name || name === '.' || name === '..') {
    return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Workspace name is required' } });
  }

  const id = `ws-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const wsPath = path.join(WORKSPACES_ROOT, name);

  const db = await getDatabase();
  if ((req.headers['x-organization-id'] || req.headers['x-project-id']) && !req.tenant) {
    return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required' } });
  }

  try {
    if (!fs.existsSync(wsPath)) {
      fs.mkdirSync(wsPath, { recursive: true });
    }
    const markerPath = path.join(wsPath, '.genos-workspace');
    if (!fs.existsSync(markerPath)) fs.writeFileSync(markerPath, 'GenOS managed workspace\n');
  } catch (err) {
    return res.status(500).json({ error: { code: 'WORKSPACE_CREATE_FAILED', message: err.message } });
  }

  await db.run(
    `INSERT OR REPLACE INTO workspaces (id, name, path, visibility, language, description, tags, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, name, wsPath, visibility, language, description, JSON.stringify([language.toLowerCase()]), req.tenant?.organizationId || null, req.tenant?.projectId || null
  );

  telemetry.emitEvent({
    eventType: 'WORKSPACE_CREATED',
    agentId: 'workspace_controller',
    action: 'CREATE_WORKSPACE',
    detail: `Created workspace: ${name} (${id})`,
    severity: 'info'
  });

  res.status(201).json({
    success: true,
    workspace: { id, name, path: wsPath, visibility, language, description }
  });
}

async function getWorkspaceById(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const ws = await findWorkspace(db, req, id);

  if (!ws) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
  }

  const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', ws.id);
  res.json({
    workspace: ws,
    snapshots,
    branches: []
  });
}

async function getSnapshots(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const workspace = await findWorkspace(db, req, id);
  if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
  const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', workspace.id);
  res.json(snapshots);
}

async function createSnapshot(req, res) {
  try {
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, req.params.id);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${req.params.id}` } });
    const snapshot = await snapshotStore.capture({
      db,
      workspace,
      label: req.body?.label || 'Workspace snapshot',
      reason: req.body?.reason || 'Manual snapshot',
      author: req.user?.username || 'studio'
    });
    telemetry.emitEvent({ eventType: 'WORKSPACE_SNAPSHOT_CREATED', agentId: req.user?.username || 'studio', action: 'SNAPSHOT', detail: `Durable snapshot ${snapshot.id} captured for ${workspace.id}`, payload: snapshot });
    res.status(201).json(snapshot);
  } catch (error) {
    res.status(500).json({ error: { code: 'SNAPSHOT_CAPTURE_FAILED', message: error.message } });
  }
}

async function restoreSnapshot(req, res) {
  try {
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, req.params.id);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${req.params.id}` } });
    const reference = req.body?.stepNumber ?? req.body?.step ?? req.body?.snapshotId;
    if (reference == null || String(reference).trim() === '') return res.status(400).json({ error: { code: 'SNAPSHOT_REQUIRED', message: 'stepNumber, step, or snapshotId is required.' } });
    const result = await snapshotStore.restore({ db, workspace, reference, author: req.user?.username || 'studio' });
    telemetry.emitEvent({ eventType: 'WORKSPACE_SNAPSHOT_RESTORED', agentId: req.user?.username || 'studio', action: 'RESTORE', detail: `Restored ${workspace.id} from ${result.restoredSnapshot.id}`, payload: { workspaceId: workspace.id, snapshotId: result.restoredSnapshot.id, safetySnapshotId: result.safetySnapshot.id } });
    res.json(result);
  } catch (error) {
    const code = /not found/i.test(error.message) ? 'SNAPSHOT_NOT_FOUND' : 'SNAPSHOT_RESTORE_FAILED';
    res.status(code === 'SNAPSHOT_NOT_FOUND' ? 404 : 500).json({ error: { code, message: error.message } });
  }
}

const bisectionService = require('../services/bisectionService');

async function getDiff(req, res, next) {
  try {
    const db = await getDatabase();
    const base = req.query.base;
    const target = req.query.target;
    if (!base || !target) return res.status(400).json({ error: { code: 'MISSING_BRANCHES', message: 'Both base and target workspaces are required.' } });
    const targetWorkspace = await findWorkspace(db, req, target);
    if (!targetWorkspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${target}` } });
    const trajectories = await db.all('SELECT * FROM trajectories WHERE workspace_id = ? ORDER BY created_at ASC', targetWorkspace.id);
    const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', targetWorkspace.id);
    const diffEntries = [];
    for (const trajectory of trajectories) {
      let lines = [];
      try { lines = JSON.parse(trajectory.diff_lines || '[]'); } catch (_) {}
      const additions = lines.filter((line) => (line.type || line.kind) === 'addition' || String(line.content || line.text || line).startsWith('+')).length;
      const deletions = lines.filter((line) => (line.type || line.kind) === 'deletion' || String(line.content || line.text || line).startsWith('-')).length;
      diffEntries.push({ file: trajectory.diff_file || 'unknown', category: 'Trajectory', additions, deletions, collisionRisk: 'UNKNOWN', author: trajectory.author_name, notes: trajectory.title });
    }
    for (const snapshot of snapshots) {
      if (!snapshot.diff_summary) continue;
      diffEntries.push({ file: snapshot.label, category: 'Snapshot', additions: 0, deletions: 0, collisionRisk: 'UNKNOWN', author: snapshot.author, notes: snapshot.diff_summary });
    }
    const diff = bisectionService.diffWorkspaces(base, targetWorkspace.name, { diffEntries });
    res.json(diff);
  } catch (err) {
    next(err);
  }
}

async function bisect(req, res, next) {
  try {
    const { workspaceId, testCommand, timeoutMs } = req.body || {};
    if (!workspaceId || !String(testCommand || '').trim()) return res.status(400).json({ error: { code: 'BISECTION_INPUT_REQUIRED', message: 'workspaceId and testCommand are required.' } });
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, workspaceId);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${workspaceId}` } });
    const rows = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', workspace.id);
    const history = rows.filter((row) => {
      try { const metadata = JSON.parse(row.metadata || '{}'); return metadata.storage === 'durable-filesystem' && metadata.manifestPath; } catch (_) { return false; }
    });
    if (history.length < 2) return res.status(409).json({ error: { code: 'NO_DURABLE_SNAPSHOTS', message: 'Capture at least two durable snapshots before running bisection.' } });
    const result = await bisectionService.bisectAnomalyAsync(history, async (snapshot) => {
      const execution = await snapshotStore.runInSnapshot({ snapshot, command: testCommand, timeoutMs: Math.min(Number(timeoutMs) || 30000, 120000) });
      snapshot._execution = execution;
      return execution.exitCode === 0;
    });
    telemetry.emitEvent({ eventType: 'WORKSPACE_BISECTION_COMPLETED', agentId: req.user?.username || 'studio', action: 'BISECTION', detail: `Bisection completed for ${workspace.id}`, payload: { workspaceId: workspace.id, command: testCommand, result } });
    res.json(result);
  } catch (error) { next(error); }
}

async function rollback(req, res, next) {
  try {
    const { workspaceId, step, stepNumber, snapshotId } = req.body || {};
    const id = workspaceId || req.params.id;
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, id);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
    const reference = snapshotId ?? stepNumber ?? step;
    if (reference == null) return res.status(400).json({ error: { code: 'SNAPSHOT_REQUIRED', message: 'A snapshot step or id is required.' } });
    const result = await snapshotStore.restore({ db, workspace, reference, author: req.user?.username || 'studio' });
    res.json({ ...result, rollback: true });
  } catch (error) { next(error); }
}

async function previewRollback(req, res, next) {
  try {
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, req.params.id);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${req.params.id}` } });
    const reference = req.query.step ?? req.query.stepNumber ?? req.query.snapshotId;
    if (reference == null) return res.status(400).json({ error: { code: 'SNAPSHOT_REQUIRED', message: 'A snapshot step or id is required.' } });
    res.json(await snapshotStore.preview({ db, workspace, reference }));
  } catch (error) { next(error); }
}

module.exports = {
  listWorkspaces,
  getWorkspaceFiles,
  createWorkspace,
  getWorkspaceById,
  getSnapshots,
  createSnapshot,
  restoreSnapshot,
  previewRollback,
  getDiff,
  bisect,
  rollback
};
