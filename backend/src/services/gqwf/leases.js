'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { withTransaction } = require('../../db');
const materialization = require('./materialization');
const storage = require('./storage');
const LEASE_MARKER = '.genos-gqwf-lease';

function materializedRoot(workspacePath) {
  return path.join(workspacePath, '.genos', 'gqwf', 'materialized');
}

async function insertPreparingLease(db, input) {
  return withTransaction(db, async () => {
    await db.run(`INSERT INTO gqwf_leases (id, workspace_id, root_hash, path, status)
      VALUES (?, ?, ?, ?, 'preparing')`, input.id, input.workspaceId,
    input.rootHash, input.destination);
    return materialization.persistReceipt(db, {
      leaseId: input.id,
      workspaceId: input.workspaceId,
      rootHash: input.rootHash,
      selection: input.selection
    });
  });
}

async function materializeRoot(db, input, options = {}) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const manifest = await storage.root(db, input.workspaceId, input.rootHash);
  await reconcileReleasingLeases(db, input, options);
  const unresolved = await db.get(`SELECT id FROM gqwf_leases WHERE workspace_id = ?
    AND status IN ('preparing', 'quarantined') LIMIT 1`, input.workspaceId);
  if (unresolved) throw new Error('GQWF lease preparation unresolved; stop writers and call reconcileReleasingLeases with recoverPreparations: true.');
  const selection = await materialization.selectMaterializer(options);
  const parent = materializedRoot(workspace.path);
  await fs.mkdir(parent, { recursive: true });
  const id = crypto.randomUUID();
  const destination = path.join(parent, `lease-${id}`);
  const receipt = await insertPreparingLease(db, {
    id, workspaceId: input.workspaceId, rootHash: input.rootHash,
    destination, selection
  });
  let created = false;
  try {
    await fs.mkdir(destination);
    created = true;
    await fs.writeFile(path.join(destination, LEASE_MARKER), id, { flag: 'wx' });
    await selection.driver.materialize({
      workspacePath: workspace.path,
      destination,
      manifest
    });
    const changed = await db.run("UPDATE gqwf_leases SET status = 'open' WHERE id = ? AND status = 'preparing'", id);
    if (changed.changes !== 1) throw new Error('GQWF lease preparation state changed.');
    return { leaseId: id, path: destination, rootHash: input.rootHash,
      materialization: receipt };
  } catch (error) {
    try {
      if (created) {
        const { lease } = await leaseRecord(db, { workspaceId: input.workspaceId, leaseId: id });
        await finishPreparation(db, lease, options);
      } else {
        await db.run("UPDATE gqwf_leases SET status = 'quarantined' WHERE id = ? AND status = 'preparing'", id);
      }
    } catch (cleanupError) {
      error.cause = cleanupError;
    }
    throw error;
  }
}

async function leaseRecord(db, input) {
  const lease = await db.get('SELECT * FROM gqwf_leases WHERE id = ? AND workspace_id = ?', input.leaseId, input.workspaceId);
  if (!lease) throw new Error('GQWF materialization lease not found.');
  const workspace = await storage.workspace(db, input.workspaceId);
  const parent = materializedRoot(workspace.path);
  const relative = path.relative(parent, path.resolve(lease.path));
  if (!/^lease-[^\\/]+$/.test(relative) || path.dirname(path.resolve(lease.path)) !== parent) {
    throw new Error('GQWF lease path is outside its managed root.');
  }
  return { lease, workspace };
}

async function managedDirectory(lease) {
  let stat;
  try {
    stat = await fs.lstat(lease.path);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('GQWF lease path is not a managed directory.');
  return true;
}

async function loadLease(db, input) {
  const record = await leaseRecord(db, input);
  if (!await managedDirectory(record.lease)) throw new Error('GQWF materialization lease directory not found.');
  return record;
}

async function ingestLease(db, input, options = {}) {
  const { lease, workspace } = await loadLease(db, input);
  if (lease.status !== 'open') throw new Error('GQWF lease is not open.');
  const selection = await materialization.resolveSelection(db, {
    leaseId: lease.id,
    workspaceId: lease.workspace_id,
    rootHash: lease.root_hash
  }, options);
  const built = await selection.driver.capture({
    sourcePath: lease.path,
    objectWorkspacePath: workspace.path
  });
  return withTransaction(db, async () => {
    const changed = await db.run("UPDATE gqwf_leases SET status = 'ingested' WHERE id = ? AND status = 'open'", input.leaseId);
    if (changed.changes !== 1) throw new Error('GQWF lease was ingested concurrently.');
    await storage.putRoot(db, input.workspaceId, built);
    return { rootHash: built.hash, previousRootHash: lease.root_hash, fileCount: built.manifest.files.length };
  });
}

async function releaseLease(db, input, options = {}) {
  const { lease } = await leaseRecord(db, input);
  if (lease.status === 'released') return { released: true };
  if (lease.status === 'preparing') throw new Error('GQWF lease is still preparing.');
  if (lease.status === 'quarantined') throw new Error('GQWF lease directory lacks ownership proof.');
  if (lease.status !== 'releasing') {
    const changed = await db.run("UPDATE gqwf_leases SET status = 'releasing' WHERE id = ? AND status IN ('open', 'ingested')", lease.id);
    if (changed.changes !== 1) {
      const latest = await leaseRecord(db, input);
      if (latest.lease.status === 'released') return { released: true };
      if (latest.lease.status !== 'releasing') throw new Error('GQWF lease release state changed.');
    }
  }
  await finishRelease(db, lease, options);
  return { released: true };
}

async function markedDirectory(lease) {
  if (!await managedDirectory(lease)) return false;
  const marker = path.join(lease.path, LEASE_MARKER);
  try {
    const stat = await fs.lstat(marker);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== Buffer.byteLength(lease.id)) return false;
    return (await fs.readFile(marker, 'utf8')) === lease.id;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function finishPreparation(db, lease, options = {}) {
  if (!await managedDirectory(lease)) {
    const changed = await db.run("UPDATE gqwf_leases SET status = 'released' WHERE id = ? AND status = 'preparing'", lease.id);
    return changed.changes === 1;
  }
  if (!await markedDirectory(lease)) {
    await db.run("UPDATE gqwf_leases SET status = 'quarantined' WHERE id = ? AND status = 'preparing'", lease.id);
    return false;
  }
  const selection = await materialization.resolveSelection(db, {
    leaseId: lease.id, workspaceId: lease.workspace_id, rootHash: lease.root_hash
  }, options);
  await selection.driver.recover({ path: lease.path });
  const changed = await db.run("UPDATE gqwf_leases SET status = 'released' WHERE id = ? AND status = 'preparing'", lease.id);
  return changed.changes === 1;
}

async function finishRelease(db, lease, options = {}) {
  if (await managedDirectory(lease)) {
    if (path.basename(lease.path) === `lease-${lease.id}` && !await markedDirectory(lease)) {
      await db.run("UPDATE gqwf_leases SET status = 'quarantined' WHERE id = ? AND status = 'releasing'", lease.id);
      throw new Error('GQWF lease directory lacks ownership proof.');
    }
    const selection = await materialization.resolveSelection(db, {
      leaseId: lease.id, workspaceId: lease.workspace_id, rootHash: lease.root_hash
    }, options);
    await selection.driver.release({ path: lease.path });
  }
  await db.run("UPDATE gqwf_leases SET status = 'released' WHERE id = ? AND status = 'releasing'", lease.id);
}

async function reconcileReleasingLeases(db, input, options = {}) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const statuses = input.recoverPreparations === true ? "('preparing', 'releasing')" : "('releasing')";
  const rows = await db.all(`SELECT id FROM gqwf_leases
    WHERE workspace_id = ? AND status IN ${statuses} ORDER BY id LIMIT 100`, input.workspaceId);
  let quarantined = 0;
  for (const row of rows) {
    const { lease } = await leaseRecord(db, { workspaceId: workspace.id, leaseId: row.id });
    if (lease.status === 'preparing') quarantined += await finishPreparation(db, lease, options) ? 0 : 1;
    else await finishRelease(db, lease, options);
  }
  return { reconciled: rows.length - quarantined, quarantined };
}

module.exports = { materializeRoot, ingestLease, releaseLease, reconcileReleasingLeases };
