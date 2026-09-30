/**
 * Agent state snapshot, commit, branch, checkout and restore endpoints.
 */

const { getDatabase } = require('../../db');
const { workspaceScope, loadAgentForScope, readString, actorName, optionalId, orDefault, nullish } = require('./helpers');
const workspaceSnapshots = require('../../services/workspaceSnapshotStore');

function newAgentSnapshotId(prefix = 'agent-state') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadScopedWorkspace(db, scope, workspaceId) {
  return db.get(`SELECT w.id, w.name, w.path FROM workspaces w WHERE w.id = ? AND ${scope.clause}`, workspaceId, ...scope.params);
}

async function captureAgentWorkspace(options) {
  const { db, scope, agent, req, snapshotId, reason } = options;
  if (!agent.workspace_id) return null;
  const workspace = await loadScopedWorkspace(db, scope, agent.workspace_id);
  if (!workspace?.path) {
    throw Object.assign(new Error('The agent workspace is unavailable for a complete state snapshot.'), { code: 'AGENT_WORKSPACE_SNAPSHOT_UNAVAILABLE' });
  }
  const snapshot = await workspaceSnapshots.capture({
    db,
    workspace,
    label: `Agent state ${snapshotId}`,
    reason,
    author: actorName(req),
    agentId: agent.id,
    branchId: req.body?.refName || 'main',
    genome: { id: agent.genome_id || null },
    state: { agentStateSnapshotId: snapshotId, status: agent.status, currentTask: agent.current_task || null },
    worldId: req.body?.worldId || 'world-main'
  });
  return { id: snapshot.id, hash: snapshot.snapshotHash, workspaceId: workspace.id };
}

function encodeAgentSnapshot(agent, workspaceSnapshot) {
  if (!workspaceSnapshot) return agent;
  return { ...agent, _genosSnapshot: { schemaVersion: 1, workspaceSnapshot } };
}

async function restoreSnapshotWorkspace(options) {
  const { db, scope, agent, state } = options;
  const reference = state._genosSnapshot?.workspaceSnapshot;
  if (!reference) return null;
  if (!agent.workspace_id || reference.workspaceId !== agent.workspace_id || !reference.id) {
    throw Object.assign(new Error('The workspace snapshot does not belong to the current agent workspace.'), { code: 'AGENT_WORKSPACE_SNAPSHOT_MISMATCH' });
  }
  const workspace = await loadScopedWorkspace(db, scope, reference.workspaceId);
  if (!workspace?.path) {
    throw Object.assign(new Error('The agent workspace is unavailable for state restore.'), { code: 'AGENT_WORKSPACE_RESTORE_UNAVAILABLE' });
  }
  return workspaceSnapshots.restore({ db, workspace, reference: reference.id, author: 'agent-state-restore' });
}

async function restoreAgentStateSnapshot(options) {
  const { db, scope, agent, state } = options;
  const workspaceRestore = await restoreSnapshotWorkspace({ db, scope, agent, state });
  try {
    await applySnapshotState(db, state, agent.id);
  } catch (error) {
    const safetySnapshotId = workspaceRestore?.safetySnapshot?.id;
    if (safetySnapshotId) {
      const workspace = await loadScopedWorkspace(db, scope, agent.workspace_id);
      await workspaceSnapshots.restore({ db, workspace, reference: safetySnapshotId, author: 'agent-state-rollback' }).catch((rollbackError) => {
        error.message += ` Workspace rollback also failed: ${rollbackError.message}`;
      });
    }
    throw error;
  }
  return { workspaceRestored: Boolean(workspaceRestore), workspaceSnapshotId: state._genosSnapshot?.workspaceSnapshot?.id || null };
}

async function applySnapshotState(db, state, agentId) {
  await db.run(
    `UPDATE agents SET name = ?, name_meaning = ?, role = ?, model_tier = ?, language = ?, isolation_mode = ?,
      dissonance_level = ?, eureka_count = ?, cognitive_budget = ?, cognitive_baseline_budget = ?, cognitive_max_dissonance = ?,
      is_apoptotic = ?, status = ?, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    state.name, state.name_meaning, state.role, state.model_tier, state.language, state.isolation_mode,
    orDefault(state.dissonance_level, 0), orDefault(state.eureka_count, 0), nullish(state.cognitive_budget, 0), nullish(state.cognitive_baseline_budget, 0),
    nullish(state.cognitive_max_dissonance, 50), orDefault(state.is_apoptotic, 0), state.status, state.current_task, agentId
  );
}

async function snapshotAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  if (!agentId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  if (!agent) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent is not available in the current tenant.' } });
  const snapshotId = newAgentSnapshotId();
  const reason = req.body?.reason || 'Agent state snapshot';
  const workspaceSnapshot = await captureAgentWorkspace({ db, scope, agent, req, snapshotId, reason });
  const state = encodeAgentSnapshot(agent, workspaceSnapshot);
  await db.run('INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)', snapshotId, agent.id, agent.workspace_id, JSON.stringify(state), reason, actorName(req));
  return res.status(201).json({ success: true, snapshotId, workspaceSnapshotId: workspaceSnapshot?.id || null, workspaceSnapshotHash: workspaceSnapshot?.hash || null, agentId: agent.id, createdAt: new Date().toISOString() });
}

async function commitAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const message = readString(req.body, 'message');
  const refName = readString(req.body, 'refName', 'main');
  if (!agentId || !message) return res.status(400).json({ error: { code: 'AGENT_COMMIT_REQUIRED', message: 'agentId and message are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  if (!agent) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent is not available in the current tenant.' } });
  const parent = await db.get('SELECT id FROM agent_state_snapshots WHERE agent_id = ? AND ref_name = ? ORDER BY created_at DESC, id DESC LIMIT 1', agentId, refName);
  const commitId = newAgentSnapshotId('agent-commit');
  const workspaceSnapshot = await captureAgentWorkspace({ db, scope, agent, req, snapshotId: commitId, reason: 'Agent commit' });
  const state = encodeAgentSnapshot(agent, workspaceSnapshot);
  await db.run(
    'INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, commit_message, parent_snapshot_id, ref_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    commitId, agent.id, agent.workspace_id, JSON.stringify(state), 'Agent commit', message, optionalId(parent), refName, actorName(req)
  );
  return res.status(201).json({ success: true, commitId, parentCommitId: optionalId(parent), workspaceSnapshotId: workspaceSnapshot?.id || null, agentId, refName, message });
}

async function branchAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const refName = readString(req.body, 'refName');
  const fromCommitId = readString(req.body, 'fromCommitId');
  if (!agentId || !refName) return res.status(400).json({ error: { code: 'AGENT_BRANCH_REQUIRED', message: 'agentId and refName are required.' } });
  if (!/^[A-Za-z0-9._-]+$/.test(refName)) return res.status(400).json({ error: { code: 'AGENT_BRANCH_INVALID', message: 'refName contains unsupported characters.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  const source = fromCommitId
    ? await db.get('SELECT * FROM agent_state_snapshots WHERE id = ? AND agent_id = ?', fromCommitId, agentId)
    : await db.get("SELECT * FROM agent_state_snapshots WHERE agent_id = ? AND ref_name = 'main' ORDER BY created_at DESC, id DESC LIMIT 1", agentId);
  if (!agent || !source) return res.status(404).json({ error: { code: 'AGENT_COMMIT_NOT_FOUND', message: 'Agent or source commit is not available.' } });
  const branchId = `agent-branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.run(
    'INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, commit_message, parent_snapshot_id, ref_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    branchId, agentId, agent.workspace_id, source.state_json, 'Agent branch', `Branch ${refName} from ${source.id}`, source.id, refName, actorName(req)
  );
  return res.status(201).json({ success: true, branchId, agentId, refName, fromCommitId: source.id });
}

async function loadCheckoutSnapshot(db, context) {
  return context.snapshotId
    ? db.get('SELECT * FROM agent_state_snapshots WHERE id = ? AND agent_id = ?', context.snapshotId, context.agentId)
    : db.get('SELECT * FROM agent_state_snapshots WHERE agent_id = ? AND ref_name = ? ORDER BY created_at DESC, id DESC LIMIT 1', context.agentId, context.refName);
}

async function checkoutAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const snapshotId = readString(req.body, 'snapshotId');
  const refName = readString(req.body, 'refName');
  if (!agentId || (!snapshotId && !refName)) return res.status(400).json({ error: { code: 'AGENT_CHECKOUT_REQUIRED', message: 'agentId and snapshotId or refName are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  const snapshot = await loadCheckoutSnapshot(db, { agentId, snapshotId, refName });
  if (!agent || !snapshot) return res.status(404).json({ error: { code: 'AGENT_CHECKOUT_NOT_FOUND', message: 'Agent or target commit/ref is not available.' } });
  const state = JSON.parse(snapshot.state_json);
  const restored = await restoreAgentStateSnapshot({ db, scope, agent, state });
  return res.json({ success: true, agentId, snapshotId: snapshot.id, refName: snapshot.ref_name || refName || 'main', reset: req.body?.reset === true, ...restored });
}

async function restoreAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const snapshotId = readString(req.body, 'snapshotId');
  if (!agentId || !snapshotId) return res.status(400).json({ error: { code: 'AGENT_SNAPSHOT_REQUIRED', message: 'agentId and snapshotId are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  const snapshot = await db.get('SELECT * FROM agent_state_snapshots WHERE id = ? AND agent_id = ?', snapshotId, agentId);
  if (!agent || !snapshot) return res.status(404).json({ error: { code: 'AGENT_SNAPSHOT_NOT_FOUND', message: 'Agent or state snapshot is not available.' } });
  const state = JSON.parse(snapshot.state_json);
  const restored = await restoreAgentStateSnapshot({ db, scope, agent, state });
  return res.json({ success: true, agentId, snapshotId, restored: true, ...restored });
}

module.exports = {
  applySnapshotState,
  restoreAgentStateSnapshot,
  snapshotAgentState,
  commitAgentState,
  branchAgentState,
  checkoutAgentState,
  restoreAgentState
};
