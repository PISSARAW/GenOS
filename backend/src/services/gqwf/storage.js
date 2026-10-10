'use strict';

const { withTransaction } = require('../../db');
const { resolveWorkspaceRoot } = require('../pathSafety');
const { parseManifest } = require('./manifest');

async function workspace(db, workspaceId) {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('GQWF workspace ID is required.');
  const row = await db.get('SELECT id, path, organization_id, project_id FROM workspaces WHERE id = ?', workspaceId);
  if (!row) throw new Error(`GQWF workspace not found: ${workspaceId}`);
  return { ...row, path: resolveWorkspaceRoot(row.path) };
}

async function root(db, workspaceId, hash) {
  const row = await db.get('SELECT manifest_json FROM gqwf_roots WHERE workspace_id = ? AND root_hash = ?', workspaceId, hash);
  if (!row) throw new Error('GQWF root is not reachable from this workspace.');
  return parseManifest(row.manifest_json, hash);
}

async function putRoot(db, workspaceId, built) {
  await db.run('INSERT OR IGNORE INTO gqwf_roots (workspace_id, root_hash, manifest_json) VALUES (?, ?, ?)',
    workspaceId, built.hash, built.serialized);
  await root(db, workspaceId, built.hash);
  return built.hash;
}

async function view(db, workspaceId, viewId) {
  const row = await db.get('SELECT id, workspace_id, base_hash, overlay_version FROM gqwf_views WHERE id = ? AND workspace_id = ?', viewId, workspaceId);
  if (!row) throw new Error(`GQWF view not found: ${viewId}`);
  return row;
}

async function changes(db, viewId) {
  return db.all('SELECT path, blob_hash, size, mode, deleted FROM gqwf_changes WHERE view_id = ? ORDER BY path', viewId);
}

async function mutateView(db, input) {
  return withTransaction(db, async () => {
    const current = await view(db, input.workspaceId, input.viewId);
    if (current.overlay_version !== input.expectedVersion) throw new Error('GQWF overlay version conflict.');
    await db.run(`INSERT INTO gqwf_changes (view_id, path, blob_hash, size, mode, deleted)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(view_id, path) DO UPDATE SET
      blob_hash=excluded.blob_hash, size=excluded.size, mode=excluded.mode, deleted=excluded.deleted`,
    input.viewId, input.path, input.hash, input.size, input.mode, input.deleted ? 1 : 0);
    const changed = await db.run('UPDATE gqwf_views SET overlay_version = overlay_version + 1 WHERE id = ? AND overlay_version = ?',
      input.viewId, input.expectedVersion);
    if (changed.changes !== 1) throw new Error('GQWF overlay version conflict.');
    return input.expectedVersion + 1;
  });
}

module.exports = { workspace, root, putRoot, view, changes, mutateView };
