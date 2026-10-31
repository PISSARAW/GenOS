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

function isPathWithinRoot(root, candidate, { allowRoot = true } = {}) {
  let realRoot;
  let realCandidate;
  try {
    // Resolve symlinks on BOTH sides. If either path cannot be resolved we
    // treat the candidate as outside the root: a lexical fallback could
    // silently follow a symlink that escapes the trusted directory.
    realRoot = fs.realpathSync(path.resolve(root));
    realCandidate = fs.realpathSync(path.resolve(candidate));
  } catch (_) {
    return false;
  }
  const relative = path.relative(realRoot, realCandidate);
  if (relative === '') return Boolean(allowRoot);
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
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
  const resolved = path.resolve(workspacePath);
  const canonical = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return `ws-${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 12)}`;
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

async function nameOwner(db, input) {
  return db.get(`SELECT id FROM workspaces WHERE COALESCE(organization_id, '') = COALESCE(?, '')
    AND COALESCE(project_id, '') = COALESCE(?, '') AND name = ?`,
  input.organizationId, input.projectId, input.name);
}

async function uniqueWorkspaceName(db, input) {
  const owner = await nameOwner(db, input);
  if (!owner || owner.id === input.id) return input.name;
  const candidate = `${input.name} (${input.id.slice(-8)})`;
  const candidateOwner = await nameOwner(db, { ...input, name: candidate });
  return candidateOwner && candidateOwner.id !== input.id ? `${input.name} (${input.id})` : candidate;
}

function assertTenantScope(scope) {
  if (!scope?.organizationId || !scope.projectId) {
    throw Object.assign(new Error('Workspace registration requires an organization and project scope.'), {
      code: 'WORKSPACE_TENANT_SCOPE_REQUIRED'
    });
  }
}

function assertTenantConsistency(existing, input) {
  if (!existing || (!existing.organization_id && !existing.project_id) || !input.organizationId) return;
  if (existing.organization_id !== input.organizationId || existing.project_id !== input.projectId) {
    throw Object.assign(new Error('Workspace path is already registered under a different tenant.'), {
      code: 'WORKSPACE_TENANT_MISMATCH'
    });
  }
}

function registeredTenant(input, existing) {
  return { organizationId: input.organizationId || existing?.organization_id || null,
    projectId: input.projectId || existing?.project_id || null };
}

async function saveRegisteredWorkspace(db, entry) {
  await db.run(`INSERT INTO workspaces (id, name, path, visibility, language, description, tags,
    organization_id, project_id) VALUES (?, ?, ?, 'Private', 'Mixed', ?, '[]', ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path,
    language = excluded.language,
    organization_id = COALESCE(workspaces.organization_id, excluded.organization_id),
    project_id = COALESCE(workspaces.project_id, excluded.project_id),
    updated_at = CURRENT_TIMESTAMP`,
  entry.id, entry.name, entry.workspacePath, entry.description,
  entry.tenant.organizationId, entry.tenant.projectId);
}

async function registerWorkspace(db, input) {
  if (input.organizationId || input.projectId) assertTenantScope(input);
  const workspacePath = path.resolve(input.workspacePath);
  const id = workspaceIdForPath(workspacePath);
  const existing = await db.get('SELECT id, organization_id, project_id FROM workspaces WHERE id = ?', id);
  assertTenantConsistency(existing, input);
  const tenant = registeredTenant(input, existing);
  const name = await uniqueWorkspaceName(db, { ...tenant, id,
    name: input.name || path.basename(workspacePath) || 'workspace' });
  await saveRegisteredWorkspace(db, { id, name, workspacePath, tenant,
    description: input.description || 'Workspace registered for a GenOS mission.' });
  return db.get('SELECT * FROM workspaces WHERE id = ?', id);
}

async function syncWorkspaceRegistry(db, root = resolveWorkspacesRoot(), tenantScope = null) {
  const resolvedRoot = path.resolve(root);
  const discovered = discoverWorkspaceDirectories(resolvedRoot);
  const workspaces = [];

  for (const workspacePath of discovered) {
    const name = workspaceName(resolvedRoot, workspacePath);
    const workspace = await registerWorkspace(db, { workspacePath, name, ...tenantScope,
      description: 'Workspace discovered inside GENOS_WORKSPACES_ROOT.' });
    if (workspace) workspaces.push(workspace);
  }

  return workspaces;
}

module.exports = {
  discoverWorkspaceDirectories,
  isPathWithinRoot,
  isWorkspaceDirectory,
  resolveWorkspacesRoot,
  registerWorkspace,
  syncWorkspaceRegistry,
  workspaceIdForPath
};
