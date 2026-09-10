/**
 * GenOS Workspaces & Time Machine Controller
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getDatabase } = require('../db');
const { sanitizeString } = require('../middleware/security');
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
  const root = resolveWorkspacesRoot();
  return workspace && isPathWithinRoot(root, workspace.path) ? workspace : null;
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
  const scope = req.tenant
    ? { clause: 'organization_id = ? AND project_id = ?', params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: 'organization_id IS NULL AND project_id IS NULL', params: [] };
  const dbWorkspaces = await db.all(`SELECT * FROM workspaces WHERE ${scope.clause} ORDER BY updated_at DESC`, ...scope.params);

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
  let { name, language = 'TypeScript', description = '', visibility = 'Private', tags } = req.body || {};
  if (typeof name === 'string') name = sanitizeString(name).trim();
  if (typeof description === 'string') description = sanitizeString(description);
  if (typeof language === 'string') language = sanitizeString(language).trim();
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(name) || path.basename(name) !== name || name === '.' || name === '..') {
    return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Workspace name must be 1-128 safe filename characters.' } });
  }
  if (typeof language !== 'string' || !language || language.length > 64 || typeof description !== 'string' || description.length > 10_000 || !['Private', 'Public'].includes(visibility)) {
    return res.status(400).json({ error: { code: 'INVALID_WORKSPACE_FIELDS', message: 'language, description, and visibility are invalid.' } });
  }

  let cleanTags = [language.toLowerCase()];
  if (Array.isArray(tags)) {
    cleanTags = tags.map(t => (typeof t === 'string' ? sanitizeString(t) : String(t)));
  }

  const db = await getDatabase();
  if ((req.headers['x-organization-id'] || req.headers['x-project-id']) && !req.tenant) {
    return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required' } });
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const tenantKey = req.tenant ? `${req.tenant.organizationId}:${req.tenant.projectId}` : '';
  const suffix = tenantKey ? `-${crypto.createHash('sha256').update(tenantKey).digest('hex').slice(0, 8)}` : '';
  const id = `ws-${slug}${suffix}`;
  const wsPath = req.tenant
    ? path.join(WORKSPACES_ROOT, '.genos-tenants', req.tenant.organizationId.replace(/[^a-zA-Z0-9._-]/g, '_'), req.tenant.projectId.replace(/[^a-zA-Z0-9._-]/g, '_'), name)
    : path.join(WORKSPACES_ROOT, name);

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
    `INSERT INTO workspaces (id, name, path, visibility, language, description, tags, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, path=excluded.path, visibility=excluded.visibility, language=excluded.language, description=excluded.description, tags=excluded.tags, updated_at=CURRENT_TIMESTAMP`,
    id, name, wsPath, visibility, language, description, JSON.stringify(cleanTags), req.tenant?.organizationId || null, req.tenant?.projectId || null
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
  const branchIds = new Set();
  for (const snapshot of snapshots) {
    try {
      const metadata = JSON.parse(snapshot.metadata || '{}');
      if (metadata.branchId || metadata.branch_id) branchIds.add(metadata.branchId || metadata.branch_id);
    } catch (_) {}
  }
  const forkWorkspaces = await db.all(
    'SELECT id, name, path FROM workspaces WHERE organization_id IS ? AND project_id IS ? AND id != ? AND (name LIKE ? OR name LIKE ?)',
    ws.organization_id || null,
    ws.project_id || null,
    ws.id,
    '%-fork%',
    '%_fork%'
  );
  res.json({
    workspace: ws,
    snapshots,
    branches: [
      ...[...branchIds].map((id) => ({ id, source: 'snapshot' })),
      ...forkWorkspaces.map((workspace) => ({ ...workspace, source: 'workspace' }))
    ]
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
const { MAX_BISECTION_SNAPSHOTS } = bisectionService;

async function getDiff(req, res, next) {
  try {
    const db = await getDatabase();
    const base = req.query.base;
    const target = req.query.target;
    if (!base || !target) return res.status(400).json({ error: { code: 'MISSING_BRANCHES', message: 'Both base and target workspaces are required.' } });
    const scope = req.tenant
      ? { clause: 'organization_id = ? AND project_id = ?', params: [req.tenant.organizationId, req.tenant.projectId] }
      : { clause: 'organization_id IS NULL AND project_id IS NULL', params: [] };
    const baseWorkspace = await db.get(`SELECT * FROM workspaces WHERE ${scope.clause} AND (id = ? OR name = ?)`, ...scope.params, base, base);
    const targetWorkspace = await findWorkspace(db, req, target);
    if (!targetWorkspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${target}` } });
    if (baseWorkspace) {
      const sameWorkspace = baseWorkspace.id === targetWorkspace.id;
      const [baseSnapshot, targetSnapshot] = await Promise.all([
        db.get(`SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? ORDER BY s.step_number ${sameWorkspace ? 'ASC' : 'DESC'} LIMIT 1`, baseWorkspace.id),
        db.get('SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? ORDER BY s.step_number DESC LIMIT 1', targetWorkspace.id)
      ]);
      if (baseSnapshot && targetSnapshot) {
        const [baseManifest, targetManifest] = await Promise.all([
          snapshotStore.readManifest(baseSnapshot),
          snapshotStore.readManifest(targetSnapshot)
        ]);
        const baseFiles = new Map(baseManifest.files.map((file) => [file.path, file]));
        const targetFiles = new Map(targetManifest.files.map((file) => [file.path, file]));
        const files = [...new Set([...baseFiles.keys(), ...targetFiles.keys()])].sort();
        const manifestDiff = files
          .filter((file) => baseFiles.get(file)?.hash !== targetFiles.get(file)?.hash)
          .map((file) => ({
            file,
            additions: targetFiles.has(file) && !baseFiles.has(file) ? 1 : 0,
            deletions: baseFiles.has(file) && !targetFiles.has(file) ? 1 : 0,
            category: 'Snapshot manifest',
            collisionRisk: 'UNKNOWN'
          }));
        return res.json(bisectionService.diffWorkspaces(baseWorkspace.name, targetWorkspace.name, { diffEntries: manifestDiff }));
      }
    }
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
    if (!snapshotStore.isAllowedTestCommand(testCommand)) {
      return res.status(400).json({ error: { code: 'TEST_COMMAND_NOT_ALLOWED', message: 'testCommand must be one of the allow-listed test commands (npm test, npm run check, pytest, cargo test).' } });
    }
    const normalizedCommand = String(testCommand).trim().replace(/\s+/g, ' ');
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, workspaceId);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${workspaceId}` } });
    const rows = await db.all(
      'SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? ORDER BY s.step_number ASC LIMIT ?',
      workspace.id,
      MAX_BISECTION_SNAPSHOTS + 1
    );
    if (rows.length > MAX_BISECTION_SNAPSHOTS) {
      return res.status(413).json({ error: { code: 'BISECTION_HISTORY_TOO_LARGE', message: `Snapshot history exceeds the ${MAX_BISECTION_SNAPSHOTS}-snapshot bisection limit.` } });
    }
    const history = rows.filter((row) => {
      try {
        const metadata = JSON.parse(row.metadata || '{}');
        return metadata.storage === 'durable-filesystem' && metadata.manifestPath && fs.existsSync(metadata.manifestPath);
      } catch (_) {
        return false;
      }
    });
    if (history.length < 2) return res.status(409).json({ error: { code: 'NO_DURABLE_SNAPSHOTS', message: 'Capture at least two durable snapshots before running bisection.' } });
    const result = await bisectionService.autoBisectWorkspaceAnomaly(db, {
      workspaceId: workspace.id,
      workspaceRoot: workspace.path,
      testCommand: normalizedCommand,
      snapshotHistory: history,
      timeoutMs: Math.min(Number(timeoutMs) || 30000, 120000),
      autoRollback: false
    });
    telemetry.emitEvent({ eventType: 'WORKSPACE_BISECTION_COMPLETED', agentId: req.user?.username || 'studio', action: 'BISECTION', detail: `Bisection completed for ${workspace.id}`, payload: { workspaceId: workspace.id, command: normalizedCommand, result } });
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
    telemetry.emitEvent({ eventType: 'WORKSPACE_ROLLBACK_COMPLETED', agentId: req.user?.username || 'studio', action: 'ROLLBACK', detail: `Rolled back ${workspace.id} to ${result.restoredSnapshot.id}`, payload: { workspaceId: workspace.id, snapshotId: result.restoredSnapshot.id, safetySnapshotId: result.safetySnapshot.id, strategy: result.strategy } });
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
