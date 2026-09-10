/**
 * Agent state snapshot, commit, branch, checkout and restore endpoints.
 */

const { getDatabase } = require('../../db');
const { workspaceScope, loadAgentForScope, readString, actorName, optionalId, orDefault, nullish } = require('./helpers');

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
  const snapshotId = `agent-state-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.run('INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)', snapshotId, agent.id, agent.workspace_id, JSON.stringify(agent), req.body?.reason || 'Agent state snapshot', actorName(req));
  return res.status(201).json({ success: true, snapshotId, agentId: agent.id, createdAt: new Date().toISOString() });
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
  const commitId = `agent-commit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.run(
    'INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, commit_message, parent_snapshot_id, ref_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    commitId, agent.id, agent.workspace_id, JSON.stringify(agent), 'Agent commit', message, optionalId(parent), refName, actorName(req)
  );
  return res.status(201).json({ success: true, commitId, parentCommitId: optionalId(parent), agentId, refName, message });
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
  await applySnapshotState(db, state, agentId);
  return res.json({ success: true, agentId, snapshotId: snapshot.id, refName: snapshot.ref_name || refName || 'main', reset: req.body?.reset === true });
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
  await applySnapshotState(db, state, agentId);
  return res.json({ success: true, agentId, snapshotId, restored: true });
}

module.exports = {
  applySnapshotState,
  snapshotAgentState,
  commitAgentState,
  branchAgentState,
  checkoutAgentState,
  restoreAgentState
};
