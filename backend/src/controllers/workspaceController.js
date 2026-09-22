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

function isPathContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const {
  findWorkspace,
  getWorkspaceFiles
} = require('./workspaceControllerFiles');

const { getDiff, bisect, rollback, previewRollback } = require('./workspaceControllerBisection');

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

function validateWorkspaceInput(options = {}) {
  const { name, language, description, visibility } = options;
  let cleanName = name;
  let cleanLanguage = language;
  let cleanDescription = description;

  if (typeof cleanName === 'string') cleanName = sanitizeString(cleanName).trim();
  if (typeof cleanDescription === 'string') cleanDescription = sanitizeString(cleanDescription);
  if (typeof cleanLanguage === 'string') cleanLanguage = sanitizeString(cleanLanguage).trim();
  if (typeof cleanName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(cleanName) || path.basename(cleanName) !== cleanName || cleanName === '.' || cleanName === '..') {
    return { error: { code: 'INVALID_NAME', message: 'Workspace name must be 1-128 safe filename characters.' } };
  }
  if (typeof cleanLanguage !== 'string' || !cleanLanguage || cleanLanguage.length > 64 || typeof cleanDescription !== 'string' || cleanDescription.length > 10_000 || !['Private', 'Public'].includes(visibility)) {
    return { error: { code: 'INVALID_WORKSPACE_FIELDS', message: 'language, description, and visibility are invalid.' } };
  }
  return { name: cleanName, language: cleanLanguage, description: cleanDescription, visibility };
}

function buildCleanTags(language, tags) {
  let cleanTags = [language.toLowerCase()];
  if (Array.isArray(tags)) {
    cleanTags = tags.map(t => (typeof t === 'string' ? sanitizeString(t) : String(t)));
  }
  return cleanTags;
}

function checkTenantScope(req, res) {
  if ((req.headers['x-organization-id'] || req.headers['x-project-id']) && !req.tenant) {
    return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required' } });
  }
  return null;
}

function buildWorkspaceIdAndPath(name, req) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const tenantKey = req.tenant ? `${req.tenant.organizationId}:${req.tenant.projectId}` : '';
  const suffix = tenantKey ? `-${crypto.createHash('sha256').update(tenantKey).digest('hex').slice(0, 8)}` : '';
  const id = `ws-${slug}${suffix}`;
  const wsPath = req.tenant
    ? path.join(WORKSPACES_ROOT, '.genos-tenants', req.tenant.organizationId.replace(/[^a-zA-Z0-9._-]/g, '_'), req.tenant.projectId.replace(/[^a-zA-Z0-9._-]/g, '_'), name)
    : path.join(WORKSPACES_ROOT, name);
  return { id, wsPath };
}

function validateWorkspacePath(wsPath) {
  if (!isPathContained(WORKSPACES_ROOT, wsPath)) {
    return { error: { code: 'WORKSPACE_PATH_ESCAPE', message: 'Workspace path escapes the workspaces root.' } };
  }
  return null;
}

function createWorkspaceDirectory(wsPath) {
  if (!fs.existsSync(wsPath)) {
    fs.mkdirSync(wsPath, { recursive: true });
  }
  const markerPath = path.join(wsPath, '.genos-workspace');
  if (!fs.existsSync(markerPath)) fs.writeFileSync(markerPath, 'GenOS managed workspace\n');
}

async function persistWorkspace(options = {}) {
  const { db, id, name, wsPath, visibility, language, description, cleanTags, req } = options;
  await db.run(
    `INSERT INTO workspaces (id, name, path, visibility, language, description, tags, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, path=excluded.path, visibility=excluded.visibility, language=excluded.language, description=excluded.description, tags=excluded.tags, updated_at=CURRENT_TIMESTAMP`,
    id, name, wsPath, visibility, language, description, JSON.stringify(cleanTags), req.tenant?.organizationId || null, req.tenant?.projectId || null
  );
}

function emitWorkspaceCreatedEvent(name, id) {
  telemetry.emitEvent({
    eventType: 'WORKSPACE_CREATED',
    agentId: 'workspace_controller',
    action: 'CREATE_WORKSPACE',
    detail: `Created workspace: ${name} (${id})`,
    severity: 'info'
  });
}

async function createWorkspace(req, res) {
  let { name, language = 'TypeScript', description = '', visibility = 'Private', tags } = req.body || {};

  const validation = validateWorkspaceInput({ name, language, description, visibility });
  if (validation.error) return res.status(400).json(validation);
  ({ name, language, description, visibility } = validation);

  const cleanTags = buildCleanTags(language, tags);

  const db = await getDatabase();
  const tenantError = checkTenantScope(req, res);
  if (tenantError) return tenantError;

  const { id, wsPath } = buildWorkspaceIdAndPath(name, req);

  const pathError = validateWorkspacePath(wsPath);
  if (pathError) return res.status(400).json(pathError);

  try {
    createWorkspaceDirectory(wsPath);
  } catch (err) {
    return res.status(500).json({ error: { code: 'WORKSPACE_CREATE_FAILED', message: err.message } });
  }

  await persistWorkspace({ db, id, name, wsPath, visibility, language, description, cleanTags, req });

  emitWorkspaceCreatedEvent(name, id);

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
