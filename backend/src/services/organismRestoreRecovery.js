const crypto = require('crypto');
const { withTransaction } = require('../db');
const snapshots = require('./workspaceSnapshotStore');
const checkpoints = require('./organismOrchestratorCheckpoint');

function parseReferences(value) {
  const references = JSON.parse(value);
  if (!Array.isArray(references)) throw new Error('Restore journal checkpoint references are invalid.');
  return references;
}

async function prepare(db, options) {
  const { agent, workspace, previous, target } = options;
  const pending = await db.get("SELECT id FROM organism_restore_attempts WHERE agent_id = ? AND status IN ('pending', 'blocked') LIMIT 1", agent.id);
  if (pending) throw Object.assign(new Error('A prior organism restore requires recovery.'),
    { code: 'ORGANISM_RESTORE_RECOVERY_PENDING', status: 409 });
  const safety = workspace ? await snapshots.capture({ db, workspace,
    label: 'Organism restore recovery', reason: `Before restoring ${agent.id}`,
    author: 'agent-state-restore', agentId: agent.id }) : null;
  const id = `organism-restore-${crypto.randomUUID()}`;
  let originalStatus = agent.status;
  await withTransaction(db, async () => {
    const current = await db.get('SELECT status FROM agents WHERE id = ?', agent.id);
    if (current) originalStatus = current.status;
    await db.run(`INSERT INTO organism_restore_attempts
      (id, agent_id, workspace_id, safety_workspace_id, safety_workspace_hash,
        previous_checkpoints_json, target_checkpoints_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, id, agent.id, agent.workspace_id,
    safety?.id || null, safety?.snapshotHash || null, JSON.stringify(previous), JSON.stringify(target));
    await db.run("UPDATE agents SET status = 'blocked' WHERE id = ?", agent.id);
  });
  return { id, agentId: agent.id, workspaceId: agent.workspace_id,
    safetyWorkspaceId: safety?.id || null, safetyWorkspaceHash: safety?.snapshotHash || null,
    originalStatus, previous, target };
}

async function complete(db, id) {
  const result = await db.run(`UPDATE organism_restore_attempts SET status = 'committed',
    finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`, id);
  if (result && result.changes !== 1) throw new Error('Organism restore journal fence was lost.');
}

function sameCheckpoint(left, right) {
  return left?.rustMissionId === right?.rustMissionId && left?.name === right?.name
    && Boolean(left?.rewound) === Boolean(right?.rewound);
}

async function assertCheckpointHeads(attempt) {
  const { previous, target } = attempt;
  if (!await checkpoints.verify(previous) || !await checkpoints.verify(target)) {
    throw new Error('Restore journal checkpoint is missing or corrupt.');
  }
  const current = await checkpoints.active(previous);
  for (let index = 0; index < previous.length; index += 1) {
    if (!sameCheckpoint(current[index], previous[index])
      && !sameCheckpoint(current[index], { ...target[index], rewound: true })) {
      throw new Error('Rust mission head changed outside the interrupted restore.');
    }
  }
}

async function restoreWorkspace(db, attempt) {
  if (!attempt.safetyWorkspaceId) return;
  const workspace = await db.get('SELECT id, path FROM workspaces WHERE id = ?', attempt.workspaceId);
  if (!workspace?.path) throw new Error('Restore journal workspace is unavailable.');
  const safety = await snapshots.getSnapshot(db, workspace.id, attempt.safetyWorkspaceId);
  if (safety.snapshot_hash !== attempt.safetyWorkspaceHash) {
    throw new Error('Restore journal safety snapshot hash changed.');
  }
  await snapshots.readManifest(safety);
  await snapshots.restore({ db, workspace, reference: safety.id, author: 'organism-restore-recovery' });
}

async function compensate(db, attempt) {
  await assertCheckpointHeads(attempt);
  await restoreWorkspace(db, attempt);
  await checkpoints.select(attempt.previous);
}

async function markBlocked(db, attempt, error) {
  await db.run("UPDATE agents SET status = 'blocked' WHERE id = ?", attempt.agentId);
  await db.run("UPDATE organism_restore_attempts SET status = 'blocked', error = ? WHERE id = ?",
    String(error.message || error).slice(0, 2000), attempt.id);
}

async function rollback(db, attempt, error) {
  try {
    const row = await db.get('SELECT status FROM organism_restore_attempts WHERE id = ?', attempt.id);
    if (row?.status === 'committed') return;
    await compensate(db, attempt);
    await db.run("UPDATE organism_restore_attempts SET status = 'rolled_back', finished_at = CURRENT_TIMESTAMP WHERE id = ?", attempt.id);
  } catch (rollbackError) {
    await markBlocked(db, attempt, rollbackError);
    error.message += ` Organism recovery blocked: ${rollbackError.message}`;
  }
}

function fromRow(row) {
  return { id: row.id, agentId: row.agent_id, workspaceId: row.workspace_id,
    safetyWorkspaceId: row.safety_workspace_id, safetyWorkspaceHash: row.safety_workspace_hash,
    previous: parseReferences(row.previous_checkpoints_json), target: parseReferences(row.target_checkpoints_json) };
}

async function recoverPending(db) {
  const rows = await db.all("SELECT * FROM organism_restore_attempts WHERE status IN ('pending', 'blocked') ORDER BY created_at, id");
  for (const row of rows) {
    const attempt = fromRow(row);
    await db.run("UPDATE agents SET status = 'blocked' WHERE id = ?", attempt.agentId);
    try {
      const agent = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', attempt.agentId);
      if (!agent || agent.runtime_pid || require('./agentOrchestrationState').activeProcesses.has(attempt.agentId)) {
        throw new Error('Restore journal agent is missing or runtime remains active.');
      }
      await checkpoints.withMissionLocks(attempt.previous, () => compensate(db, attempt));
      await db.run("UPDATE organism_restore_attempts SET status = 'recovered', error = NULL, finished_at = CURRENT_TIMESTAMP WHERE id = ?", attempt.id);
    } catch (error) {
      await markBlocked(db, attempt, error);
      throw Object.assign(new Error(`Organism restore ${attempt.id} requires recovery: ${error.message}`),
        { code: 'ORGANISM_RESTORE_RECOVERY_BLOCKED' });
    }
  }
  return rows.length;
}

async function assertClear(db) {
  const pending = await db.get("SELECT id FROM organism_restore_attempts WHERE status IN ('pending', 'blocked') LIMIT 1");
  if (pending) throw Object.assign(new Error(`Organism restore ${pending.id} requires recovery before serving.`),
    { code: 'ORGANISM_RESTORE_RECOVERY_PENDING' });
}

async function waitUntilClear(db) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const pending = await db.get("SELECT id FROM organism_restore_attempts WHERE status IN ('pending', 'blocked') LIMIT 1");
    if (!pending) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await assertClear(db);
}

module.exports = { prepare, complete, rollback, recoverPending, waitUntilClear };
