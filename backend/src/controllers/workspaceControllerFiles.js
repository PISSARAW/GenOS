const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getDatabase } = require('../db');
const { isPathWithinRoot, resolveWorkspacesRoot } = require('../services/workspaceRegistry');
const execFileAsync = promisify(execFile);

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

module.exports = {
  findWorkspace,
  getWorkspaceFiles
};
