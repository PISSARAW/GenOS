/**
 * Agent state replay and bisect endpoints.
 */

const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { workspaceScope, loadAgentForScope, readString } = require('./helpers');
const { applySnapshotState } = require('./snapshots');

function nestedStateValue(state, field) {
  return String(field).split('.').reduce((value, key) => value == null ? undefined : value[key], state);
}

function stateDigest(state) {
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

async function maybeApplySnapshot(db, context) {
  if (context.body?.apply !== true) return false;
  await applySnapshotState(db, context.state, context.agentId);
  return true;
}

async function replayAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const snapshotId = readString(req.body, 'snapshotId');
  if (!agentId || !snapshotId) return res.status(400).json({ error: { code: 'AGENT_REPLAY_REQUIRED', message: 'agentId and snapshotId are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  const snapshot = await db.get(`SELECT s.* FROM agent_state_snapshots s JOIN agents a ON a.id = s.agent_id LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE s.id = ? AND s.agent_id = ? AND ${scope.clause}`, snapshotId, agentId, ...scope.params);
  if (!agent || !snapshot) return res.status(404).json({ error: { code: 'AGENT_SNAPSHOT_NOT_FOUND', message: 'Agent or state snapshot is not available.' } });
  const state = JSON.parse(snapshot.state_json);
  const digest = stateDigest(state);
  const applied = await maybeApplySnapshot(db, { body: req.body, state, agentId });
  return res.json({ success: true, replayVerified: digest === stateDigest(JSON.parse(snapshot.state_json)), agentId, snapshotId, state, stateDigest: digest, applied, mode: applied ? 'applied' : 'preview' });
}

function findBisectCulprit(rows, matches) {
  let low = 1;
  let high = rows.length - 1;
  let culprit = -1;
  let iterations = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    iterations += 1;
    if (matches(rows[middle])) low = middle + 1;
    else { culprit = middle; high = middle - 1; }
  }
  return { culprit, iterations };
}

async function bisectAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const field = readString(req.body, 'field');
  if (!agentId || !field) return res.status(400).json({ error: { code: 'AGENT_BISECT_REQUIRED', message: 'agentId and field are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await db.get(`SELECT a.id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, agentId, ...scope.params);
  if (!agent) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent is not available in the current tenant.' } });
  const rows = await db.all(`SELECT s.id, s.state_json, s.created_at FROM agent_state_snapshots s JOIN agents a ON a.id = s.agent_id LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE s.agent_id = ? AND ${scope.clause} ORDER BY s.created_at ASC, s.id ASC`, agentId, ...scope.params);
  if (rows.length < 2) return res.status(409).json({ error: { code: 'AGENT_BISECT_HISTORY_TOO_SMALL', message: 'At least two agent state snapshots are required.' } });
  const expected = req.body?.expectedValue;
  const matches = (row) => JSON.stringify(nestedStateValue(JSON.parse(row.state_json), field)) === JSON.stringify(expected);
  if (!matches(rows[0])) return res.json({ success: true, anomalyFound: true, culpritSnapshotId: rows[0].id, field, expectedValue: expected, iterations: 0, reason: 'Baseline snapshot already diverges.' });
  const result = findBisectCulprit(rows, matches);
  return res.json({ success: true, anomalyFound: result.culprit >= 0, culpritSnapshotId: result.culprit >= 0 ? rows[result.culprit].id : null, culpritIndex: result.culprit, field, expectedValue: expected, iterations: result.iterations, complexity: `O(log2(${rows.length}))` });
}

module.exports = {
  replayAgentState,
  bisectAgentState
};
