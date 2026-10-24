'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const registry = require('../src/services/workspaceRegistry');

function workspaceError(message, code = 'ORCHESTRATOR_WORKSPACE_INVALID') {
  return Object.assign(new Error(message), { code });
}

function samePath(left, right) {
  const first = path.resolve(left);
  const second = path.resolve(right);
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

async function checkedRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw workspaceError('Mission workspace root must be an absolute path.');
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) throw workspaceError('Mission workspace cannot be a filesystem root.');
  let current = path.parse(resolved).root;
  for (const segment of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const entry = await fs.lstat(current);
    if (entry.isSymbolicLink()) throw workspaceError('Mission workspace must not traverse a symbolic link or junction.');
    if (samePath(current, resolved) && !entry.isDirectory()) throw workspaceError('Mission workspace must be a directory.');
  }
  return resolved;
}

async function workspaceByPath(db, root) {
  const rows = await db.all('SELECT * FROM workspaces');
  return rows.find((row) => row.path && path.isAbsolute(row.path) && samePath(row.path, root)) || null;
}

async function requestedWorkspace(db, requestedId, root) {
  const workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', requestedId);
  if (!workspace) throw workspaceError(`Mission workspace '${requestedId}' was not found.`);
  if (root && !samePath(workspace.path, root)) {
    throw workspaceError(`Mission workspace '${requestedId}' does not match '${root}'.`, 'ORCHESTRATOR_WORKSPACE_MISMATCH');
  }
  return requireTenantScope(workspace);
}

function requireTenantScope(workspace) {
  if (!workspace?.organization_id || !workspace.project_id) {
    throw workspaceError('Mission workspace must be registered to an organization and project.',
      'ORCHESTRATOR_WORKSPACE_SCOPE_REQUIRED');
  }
  return workspace;
}

async function registerRequestedRoot(db, root, request) {
  const scopeId = request.workspaceScopeId || request.workspace_scope_id;
  if (!scopeId) throw workspaceError('Register this workspace with a tenant scope before mission execution.',
    'ORCHESTRATOR_WORKSPACE_SCOPE_REQUIRED');
  const scope = await db.get('SELECT organization_id, project_id FROM workspaces WHERE id = ?', scopeId);
  if (!scope?.organization_id || !scope.project_id) {
    throw workspaceError('Workspace scope anchor must belong to an organization and project.',
      'ORCHESTRATOR_WORKSPACE_SCOPE_REQUIRED');
  }
  return requireTenantScope(await registry.registerWorkspace(db, { workspacePath: root,
    organizationId: scope.organization_id, projectId: scope.project_id }));
}

async function resolveMissionWorkspace(db, request = {}) {
  const requestedId = request.workspaceId || request.workspace_id;
  const requestedRoot = request.workspaceRoot || request.workspace_root || process.env.GENOS_WORKSPACE_ROOT;
  const root = requestedRoot ? await checkedRoot(requestedRoot) : null;
  if (requestedId) return requestedWorkspace(db, requestedId, root);
  if (!root) return null;
  const existing = await workspaceByPath(db, root);
  if (existing) return requireTenantScope(existing);
  return registerRequestedRoot(db, root, request);
}

async function requireMissionWorkspace(db, request = {}) {
  const workspace = await resolveMissionWorkspace(db, request);
  if (!workspace?.id || !workspace.organization_id || !workspace.project_id) {
    throw workspaceError('Mission admission requires a tenant-scoped workspace.',
      'ORCHESTRATOR_WORKSPACE_SCOPE_REQUIRED');
  }
  return workspace;
}

async function applyMissionWorkspace(db, request) {
  const workspace = await requireMissionWorkspace(db, request);
  return Object.assign(request, { workspaceId: workspace.id, workspaceRoot: workspace.path });
}

module.exports = { applyMissionWorkspace, resolveMissionWorkspace, requireMissionWorkspace };
