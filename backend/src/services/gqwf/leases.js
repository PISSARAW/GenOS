'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { withTransaction } = require('../../db');
const { importWorkspace } = require('./import');
const { readBlob } = require('./objects');
const storage = require('./storage');

function materializedRoot(workspacePath) {
  return path.join(workspacePath, '.genos', 'gqwf', 'materialized');
}

async function writeFiles(workspacePath, destination, manifest) {
  for (const file of manifest.files) {
    const target = path.join(destination, ...file.path.split('/'));
    const bytes = await readBlob(workspacePath, file.hash);
    if (bytes.length !== file.size) throw new Error('GQWF materialization file size mismatch.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
    await fs.chmod(target, file.mode);
  }
}

async function materializeRoot(db, input) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const manifest = await storage.root(db, input.workspaceId, input.rootHash);
  const parent = materializedRoot(workspace.path);
  await fs.mkdir(parent, { recursive: true });
  const destination = await fs.mkdtemp(path.join(parent, 'lease-'));
  const id = crypto.randomUUID();
  try {
    await writeFiles(workspace.path, destination, manifest);
    await db.run(`INSERT INTO gqwf_leases (id, workspace_id, root_hash, path, status)
      VALUES (?, ?, ?, ?, 'open')`, id, input.workspaceId, input.rootHash, destination);
    return { leaseId: id, path: destination, rootHash: input.rootHash };
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    throw error;
  }
}

async function loadLease(db, input) {
  const lease = await db.get('SELECT * FROM gqwf_leases WHERE id = ? AND workspace_id = ?', input.leaseId, input.workspaceId);
  if (!lease) throw new Error('GQWF materialization lease not found.');
  const workspace = await storage.workspace(db, input.workspaceId);
  const parent = materializedRoot(workspace.path);
  const relative = path.relative(parent, path.resolve(lease.path));
  if (!/^lease-[^\\/]+$/.test(relative) || path.dirname(path.resolve(lease.path)) !== parent) {
    throw new Error('GQWF lease path is outside its managed root.');
  }
  const stat = await fs.lstat(lease.path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('GQWF lease path is not a managed directory.');
  return { lease, workspace };
}

async function ingestLease(db, input) {
  const { lease, workspace } = await loadLease(db, input);
  if (lease.status !== 'open') throw new Error('GQWF lease is not open.');
  const built = await importWorkspace(lease.path, workspace.path);
  return withTransaction(db, async () => {
    const changed = await db.run("UPDATE gqwf_leases SET status = 'ingested' WHERE id = ? AND status = 'open'", input.leaseId);
    if (changed.changes !== 1) throw new Error('GQWF lease was ingested concurrently.');
    await storage.putRoot(db, input.workspaceId, built);
    return { rootHash: built.hash, previousRootHash: lease.root_hash, fileCount: built.manifest.files.length };
  });
}

async function releaseLease(db, input) {
  const { lease } = await loadLease(db, input);
  await db.run("UPDATE gqwf_leases SET status = 'released' WHERE id = ?", input.leaseId);
  await fs.rm(lease.path, { recursive: true, force: true });
  return { released: true };
}

module.exports = { materializeRoot, ingestLease, releaseLease };
