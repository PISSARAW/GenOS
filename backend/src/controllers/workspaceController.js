/**
 * GenOS Workspaces & Time Machine Controller
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const execFileAsync = promisify(execFile);

const WORKSPACES_ROOT = process.env.GENOS_WORKSPACES_ROOT
  ? path.resolve(process.env.GENOS_WORKSPACES_ROOT)
  : path.resolve(process.cwd(), 'workspaces');

async function getWorkspaceFiles(req, res) {
  const db = await getDatabase();
  const requestedId = String(req.params.id || '').trim();
  const workspace = await db.get('SELECT * FROM workspaces WHERE id = ? OR name = ?', requestedId, requestedId);
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
    ? await db.all('SELECT * FROM workspaces WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC', req.tenant.organizationId, req.tenant.projectId)
    : await db.all('SELECT * FROM workspaces ORDER BY created_at DESC');
  const agentCount = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
  const activeCount = agentCount ? agentCount.count : 0;

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
      agents: `${activeCount} Active`,
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
  if (process.env.GENOS_SINGLE_WORKSPACE === '1') {
    return res.status(409).json({
      error: {
        code: 'SINGLE_WORKSPACE_MODE',
        message: 'This Studio instance manages only the workspace mounted through GENOS_WORKSPACE_ROOT.'
      }
    });
  }

  const { name, language = 'TypeScript', description = '', visibility = 'Private' } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Workspace name is required' } });
  }

  const id = `ws-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const wsPath = path.join(WORKSPACES_ROOT, name);

  try {
    if (!fs.existsSync(wsPath)) {
      fs.mkdirSync(wsPath, { recursive: true });
    }
  } catch (err) {
    // Filesystem may be mock or read-only in sandbox
  }

  const db = await getDatabase();
  if (req.headers['x-organization-id'] || req.headers['x-project-id']) {
    if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required' } });
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
  const ws = req.tenant
    ? await db.get('SELECT * FROM workspaces WHERE (id = ? OR name = ?) AND organization_id = ? AND project_id = ?', id, id, req.tenant.organizationId, req.tenant.projectId)
    : await db.get('SELECT * FROM workspaces WHERE id = ? OR name = ?', id, id);

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
  const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? OR workspace_id = ? ORDER BY step_number ASC', id, `ws-${id}`);
  res.json(snapshots);
}

async function createSnapshot(req, res) {
  return res.status(501).json({
    error: {
      code: 'SNAPSHOT_STORAGE_UNAVAILABLE',
      message: 'Workspace state capture is unavailable because this backend has no durable snapshot storage provider.'
    }
  });
}

async function restoreSnapshot(req, res) {
  return res.status(501).json({
    error: {
      code: 'SNAPSHOT_STORAGE_UNAVAILABLE',
      message: 'Workspace restore is unavailable because no durable workspace state was captured.'
    }
  });
}

const bisectionService = require('../services/bisectionService');

async function getDiff(req, res, next) {
  try {
    const db = await getDatabase();
    const base = req.query.base;
    const target = req.query.target;
    if (!base || !target) return res.status(400).json({ error: { code: 'MISSING_BRANCHES', message: 'Both base and target workspaces are required.' } });
    const targetWorkspace = await db.get('SELECT * FROM workspaces WHERE id = ? OR name = ?', target, target);
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
  return res.status(501).json({ error: { code: 'BISECTION_RUNNER_UNAVAILABLE', message: 'Causal bisection is unavailable because this backend cannot execute the supplied test command against durable workspace revisions.' } });
}

async function rollback(req, res, next) {
  return res.status(501).json({ error: { code: 'SNAPSHOT_STORAGE_UNAVAILABLE', message: 'Atomic rollback is unavailable because this backend cannot restore durable workspace state.' } });
}

async function previewRollback(req, res, next) {
  return res.status(501).json({ error: { code: 'SNAPSHOT_STORAGE_UNAVAILABLE', message: 'Rollback previews are unavailable because this backend has no durable workspace state to compare.' } });
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
