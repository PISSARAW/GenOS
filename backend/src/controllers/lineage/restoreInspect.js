'use strict';

const { getDatabase } = require('../../db');
const { workspaceScope, loadAgentForScope, readString } = require('./helpers');
const preflight = require('../../services/organismRestorePreflight');
const snapshotCapabilities = require('../../services/organismSnapshotCapabilities');

async function inspectAgentRestore(req, res) {
  snapshotCapabilities.assertRequest(req.body);
  const agentId = readString(req.body, 'agentId');
  const snapshotId = readString(req.body, 'snapshotId');
  if (!agentId || !snapshotId) {
    return res.status(400).json({ error: { code: 'AGENT_SNAPSHOT_REQUIRED',
      message: 'agentId and snapshotId are required.' } });
  }
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  if (!agent) {
    return res.status(404).json({ error: { code: 'AGENT_SNAPSHOT_NOT_FOUND',
      message: 'Agent or state snapshot is not available.' } });
  }
  const snapshot = await db.get('SELECT workspace_id, state_json FROM agent_state_snapshots WHERE id = ? AND agent_id = ?',
    snapshotId, agentId);
  if (!snapshot || snapshot.workspace_id !== agent.workspace_id) {
    return res.status(404).json({ error: { code: 'AGENT_SNAPSHOT_NOT_FOUND',
      message: 'Agent or state snapshot is not available.' } });
  }
  let state;
  try { state = JSON.parse(snapshot.state_json); }
  catch (_) { return res.status(409).json({ error: { code: 'ORGANISM_SNAPSHOT_INVALID_JSON',
    message: 'State snapshot JSON is invalid.' } }); }
  const inspected = await preflight.inspect({ db, scope, agent, state });
  return res.json({ agentId, snapshotId, ...inspected });
}

module.exports = { inspectAgentRestore };
