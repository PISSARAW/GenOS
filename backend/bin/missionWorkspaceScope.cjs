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
  const rows = await db.all('SELECT id, path FROM workspaces');
  return rows.find((row) => row.path && samePath(row.path, root)) || null;
}

async function requestedWorkspace(db, requestedId, root) {
  const workspace = await db.get('SELECT id, path FROM workspaces WHERE id = ?', requestedId);
  if (!workspace) throw workspaceError(`Mission workspace '${requestedId}' was not found.`);
  if (root && !samePath(workspace.path, root)) {
    throw workspaceError(`Mission workspace '${requestedId}' does not match '${root}'.`, 'ORCHESTRATOR_WORKSPACE_MISMATCH');
  }
  return workspace;
}

async function resolveMissionWorkspace(db, request = {}) {
  const requestedId = request.workspaceId || request.workspace_id;
  const requestedRoot = request.workspaceRoot || request.workspace_root;
  const root = requestedRoot ? await checkedRoot(requestedRoot) : null;
  if (requestedId) return requestedWorkspace(db, requestedId, root);
  if (!root) return null;
  const existing = await workspaceByPath(db, root);
  if (existing) return existing;
  await registry.syncWorkspaceRegistry(db, root);
  const registered = await workspaceByPath(db, root);
  if (!registered) throw workspaceError(`Mission workspace '${root}' is not a recognized project directory.`);
  return registered;
}

module.exports = { resolveMissionWorkspace };
