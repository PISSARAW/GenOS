'use strict';

const path = require('node:path');
const { withTransaction } = require('../../db');
const { importWorkspace } = require('./import');
const storage = require('./storage');
const { createView } = require('./views');

function samePath(left, right) {
  const first = path.resolve(left);
  const second = path.resolve(right);
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

async function ownedCapsule(db, workerId, capsulePath) {
  const row = await db.get('SELECT workspace_root FROM agent_capsule_cleanup WHERE agent_id = ?', workerId);
  if (!row?.workspace_root || !samePath(row.workspace_root, capsulePath)) {
    throw new Error('GQWF worker capsule is not owned by this worker.');
  }
}

async function binding(db, workerId) {
  return db.get('SELECT * FROM gqwf_worker_bindings WHERE worker_id = ?', workerId);
}

async function inspectWorker(db, input) {
  const row = await binding(db, input.workerId);
  if (!row || row.workspace_id !== input.workspaceId) throw new Error('GQWF worker binding not found.');
  return describe(row);
}

async function bindWorker(db, input) {
  const workspace = await storage.workspace(db, input.workspaceId);
  await ownedCapsule(db, input.workerId, input.capsulePath);
  if (samePath(workspace.path, input.capsulePath)) throw new Error('GQWF worker capsule must be isolated.');
  const existing = await binding(db, input.workerId);
  if (existing) {
    if (existing.workspace_id !== input.workspaceId || !samePath(existing.capsule_path, input.capsulePath)) {
      throw new Error('GQWF worker binding identity changed.');
    }
    return describe(existing);
  }
  const built = await importWorkspace(input.capsulePath, workspace.path);
  return withTransaction(db, async () => {
    await storage.putRoot(db, input.workspaceId, built);
    const view = await createView(db, { workspaceId: input.workspaceId, baseHash: built.hash });
    await db.run(`INSERT INTO gqwf_worker_bindings
      (worker_id, workspace_id, capsule_path, base_hash, view_id, status)
      VALUES (?, ?, ?, ?, ?, 'open')`, input.workerId, input.workspaceId,
    path.resolve(input.capsulePath), built.hash, view.id);
    return { workerId: input.workerId, workspaceId: input.workspaceId,
      baseHash: built.hash, viewId: view.id, status: 'open' };
  });
}

function describe(row) {
  return { workerId: row.worker_id, workspaceId: row.workspace_id,
    baseHash: row.base_hash, viewId: row.view_id, candidateHash: row.candidate_hash,
    status: row.status, error: row.error };
}

function differences(base, candidate) {
  const oldFiles = new Map(base.files.map((file) => [file.path, file]));
  const newFiles = new Map(candidate.files.map((file) => [file.path, file]));
  const changed = [];
  for (const filePath of new Set([...oldFiles.keys(), ...newFiles.keys()])) {
    const previous = oldFiles.get(filePath);
    const next = newFiles.get(filePath);
    if (JSON.stringify(previous) !== JSON.stringify(next)) changed.push(next || { path: filePath, deleted: true });
  }
  return changed;
}

async function persistCandidate(db, row, built) {
  return withTransaction(db, async () => {
    const current = await binding(db, row.worker_id);
    if (current.status === 'captured') return describe(current);
    const view = await storage.view(db, row.workspace_id, row.view_id);
    if (view.overlay_version !== 0) throw new Error('GQWF worker view changed before physical capture.');
    const base = await storage.root(db, row.workspace_id, row.base_hash);
    await storage.putRoot(db, row.workspace_id, built);
    for (const file of differences(base, built.manifest)) {
      await db.run(`INSERT INTO gqwf_changes (view_id, path, blob_hash, size, mode, deleted)
        VALUES (?, ?, ?, ?, ?, ?)`, row.view_id, file.path, file.hash || null,
      file.size ?? null, file.mode ?? null, file.deleted ? 1 : 0);
    }
    await db.run('UPDATE gqwf_views SET overlay_version = 1 WHERE id = ?', row.view_id);
    await db.run(`UPDATE gqwf_worker_bindings SET candidate_hash = ?, status = 'captured', error = NULL
      WHERE worker_id = ? AND status IN ('open', 'capture_failed')`, built.hash, row.worker_id);
    return { ...describe(row), candidateHash: built.hash, status: 'captured', error: null };
  });
}

async function captureWorker(db, workerId) {
  const table = await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gqwf_worker_bindings'");
  if (!table) return null;
  const row = await binding(db, workerId);
  if (!row) return null;
  if (row.status === 'captured') return describe(row);
  try {
    await ownedCapsule(db, workerId, row.capsule_path);
    const workspace = await storage.workspace(db, row.workspace_id);
    const built = await importWorkspace(row.capsule_path, workspace.path);
    return await persistCandidate(db, row, built);
  } catch (error) {
    await db.run(`UPDATE gqwf_worker_bindings SET status = 'capture_failed', error = ?
      WHERE worker_id = ? AND status IN ('open', 'capture_failed')`, String(error.message).slice(0, 1000), workerId);
    throw error;
  }
}

module.exports = { bindWorker, captureWorker, inspectWorker, binding };
