'use strict';

async function ensureArchiveTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS strategy_rejected_branch_archives (
    run_id TEXT NOT NULL, branch_id TEXT NOT NULL, agent_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (run_id, branch_id),
    FOREIGN KEY (snapshot_id) REFERENCES workspace_snapshots(id))`);
}

function requireBranchIdentity(branch, context) {
  if (!branch || typeof branch !== 'object' || !branch.branchId || !branch.snapshotId || !branch.workspaceId) {
    throw new Error('A rejected branch requires its branch ID, workspace ID, and durable snapshot ID.');
  }
  if (!context.agentId || !context.runId) throw new Error('A rejected branch archive requires its promotion run and agent.');
}

async function verifiedSnapshot(db, branch, context) {
  const workspace = await db.get(`SELECT w.id FROM workspaces w JOIN agents a ON a.workspace_id = w.id
    WHERE a.id = ? AND w.id = ?`, context.agentId, branch.workspaceId);
  if (!workspace) throw new Error('The rejected branch workspace is not bound to the promotion agent.');
  const snapshots = require('./workspaceSnapshotStore');
  const snapshot = await snapshots.getSnapshot(db, branch.workspaceId, branch.snapshotId);
  const manifest = await snapshots.readManifest(snapshot);
  if (manifest.branch_id !== branch.branchId || manifest.agent_id !== context.agentId) {
    throw new Error('The rejected branch snapshot does not match its branch and agent.');
  }
  return snapshot;
}

async function persistArchive({ db, context, branch, snapshot }) {
  await ensureArchiveTable(db);
  await db.run(`INSERT OR IGNORE INTO strategy_rejected_branch_archives
    (run_id, branch_id, agent_id, workspace_id, snapshot_id, snapshot_hash)
    VALUES (?, ?, ?, ?, ?, ?)`, context.runId, branch.branchId, context.agentId,
  branch.workspaceId, snapshot.id, snapshot.snapshot_hash);
  const row = await db.get('SELECT * FROM strategy_rejected_branch_archives WHERE run_id = ? AND branch_id = ?',
    context.runId, branch.branchId);
  if (row.snapshot_id !== snapshot.id || row.snapshot_hash !== snapshot.snapshot_hash) {
    throw new Error('A rejected branch is already archived with a different snapshot.');
  }
}

async function recordArchiveEvent({ db, context, branch, snapshot }) {
  await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json)
    VALUES (?, 'BRANCH_PRESERVED', 'PRESERVE', ?, ?)`, context.agentId,
  `Preserved rejected branch ${branch.branchId} from snapshot ${snapshot.id}.`,
  JSON.stringify({ branchId: branch.branchId, snapshotId: snapshot.id, snapshotHash: snapshot.snapshot_hash, preserved: true }));
}

async function preserveRejectedBranch(db, context, branch) {
  try {
    requireBranchIdentity(branch, context);
    const snapshot = await verifiedSnapshot(db, branch, context);
    await persistArchive({ db, context, branch, snapshot });
    await recordArchiveEvent({ db, context, branch, snapshot }).catch(() => {});
    return { action: 'preserve_branch', branchId: branch.branchId, snapshotId: snapshot.id, preserved: true };
  } catch (error) {
    return { action: 'preserve_branch', branchId: branch?.branchId, preserved: false, error: error.message };
  }
}

async function preserveRejectedBranches(db, context) {
  if (context.rejectedBranches !== undefined && !Array.isArray(context.rejectedBranches)) {
    return [{ action: 'preserve_branch', preserved: false, error: 'Rejected branches must be an array.' }];
  }
  const branches = context.rejectedBranches?.length
    ? context.rejectedBranches : (context.rejectedBranchIds || []).map(branchId => ({ branchId }));
  const actions = [];
  for (const branch of branches) actions.push(await preserveRejectedBranch(db, context, branch));
  return actions;
}

module.exports = { preserveRejectedBranches };
