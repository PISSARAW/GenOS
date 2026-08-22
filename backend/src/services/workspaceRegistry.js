/**
 * Filesystem-backed workspace discovery for a trusted local projects root.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IGNORED_DIRECTORIES = new Set([
  '.git', '.genos', '.next', '.venv', 'coverage', 'dist', 'node_modules', 'target'
]);
const PROJECT_MARKERS = ['.genos-workspace', 'Cargo.toml', 'package.json', 'README.md', 'pyproject.toml'];

function resolveWorkspacesRoot() {
  const configured = String(process.env.GENOS_WORKSPACES_ROOT || process.env.GENOS_WORKSPACE_ROOT || '').trim();
  if (configured) return path.resolve(configured);

  // In local development the backend is normally started from `backend/`.
  // Defaulting from process.cwd() would then hide sibling repositories such as
  // EkoRubix-AS in the trusted projects directory. Keep deployments explicit
  // through GENOS_WORKSPACES_ROOT, while making the local default the parent
  // directory that contains the GenOS checkout.
  return path.resolve(__dirname, '../../../..');
}

function isPathWithinRoot(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isWorkspaceDirectory(directory) {
  try {
    if (!fs.statSync(directory).isDirectory()) return false;
    if (fs.existsSync(path.join(directory, '.git'))) return true;
    return PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(directory, marker)));
  } catch (_) {
    return false;
  }
}

function workspaceIdForPath(workspacePath) {
  return `ws-${crypto.createHash('sha256').update(path.resolve(workspacePath)).digest('hex').slice(0, 12)}`;
}

function discoverWorkspaceDirectories(root = resolveWorkspacesRoot()) {
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot)) return [];

  const candidates = [resolvedRoot];
  try {
    for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      candidates.push(path.join(resolvedRoot, entry.name));
    }
  } catch (_) {
    return [];
  }

  return candidates
    .filter(isWorkspaceDirectory)
    .map((workspacePath) => path.resolve(workspacePath));
}

function workspaceName(root, workspacePath) {
  const relative = path.relative(path.resolve(root), workspacePath);
  return relative || path.basename(workspacePath) || 'workspace';
}

async function syncWorkspaceRegistry(db, root = resolveWorkspacesRoot()) {
  const resolvedRoot = path.resolve(root);
  const discovered = discoverWorkspaceDirectories(resolvedRoot);
  const workspaces = [];

  for (const workspacePath of discovered) {
    const name = workspaceName(resolvedRoot, workspacePath);
    const id = workspaceIdForPath(workspacePath);
    await db.run(
      `INSERT INTO workspaces (id, name, path, visibility, language, description, tags)
       VALUES (?, ?, ?, 'Private', 'Mixed', ?, '[]')
       ON CONFLICT(name) DO UPDATE SET
         path = excluded.path,
         language = excluded.language,
         updated_at = CURRENT_TIMESTAMP`,
      id,
      name,
      workspacePath,
      'Workspace discovered inside GENOS_WORKSPACES_ROOT.'
    );
    const workspace = await db.get('SELECT * FROM workspaces WHERE name = ?', name);
    if (workspace) workspaces.push(workspace);
  }

  return workspaces;
}

module.exports = {
  discoverWorkspaceDirectories,
  isPathWithinRoot,
  isWorkspaceDirectory,
  resolveWorkspacesRoot,
  syncWorkspaceRegistry,
  workspaceIdForPath
};
