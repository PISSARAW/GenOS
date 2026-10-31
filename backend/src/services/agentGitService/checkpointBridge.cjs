'use strict';

const { storeObject } = require('./storeObjectHelper.cjs');
const { updateRef } = require('./refs');
const { verifySource } = require('./verifiedMerge.cjs');

async function linkCapture(input) {
  const { db, req, agentId, snapshotId, state } = input;
  const integrity = require('../../controllers/lineage/snapshots').verifyOrganismSnapshot(state);
  if (!integrity.valid || integrity.legacy) throw new Error('A sealed organism snapshot is required.');
  const agentGit = require('./index');
  const captured = await agentGit.collectState(db, req, agentId);
  if (!captured || captured.agent.workspace_id !== state.workspace_id) throw new Error('Checkpoint capture scope changed.');
  const refName = `checkpoint/${input.refName || 'main'}`;
  const previous = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  const checkpoint = { schema: 'genos.agent-checkpoint/v1', snapshotId,
    organismHash: integrity.hash, workspaceHash: state._genosSnapshot.workspaceSnapshot?.hash || null };
  const object = await storeObject(db, { agentId, workspaceId: state.workspace_id, kind: 'commit',
    refName, state: captured, parentCommitId: previous?.object_id || null,
    createdBy: req.user?.username || 'agent-checkpoint', metadata: { checkpoint } });
  await updateRef({ db, req, agentId, refName, objectId: object.id,
    options: { action: 'checkpoint', inTransaction: true } });
  return { ...checkpoint, objectId: object.id, refName };
}

async function linkCaptureIfEnabled(input) {
  return process.env.GENOS_AGENT_GIT_CHECKPOINT_BRIDGE === 'true' ? linkCapture(input) : null;
}

async function verifyLink(db, object) {
  let checkpoint;
  try { checkpoint = JSON.parse(object.metadata_json || '{}').checkpoint; }
  catch (_) { return { valid: false, error: 'AgentGit checkpoint metadata is invalid JSON.' }; }
  if (checkpoint?.schema !== 'genos.agent-checkpoint/v1' || !checkpoint.snapshotId) {
    return { valid: false, error: 'AgentGit object has no sealed checkpoint link.' };
  }
  const issues = verifySource(object);
  if (issues.length) return { valid: false, error: 'AgentGit checkpoint verification failed.', issues };
  const row = await db.get(`SELECT id, state_json FROM agent_state_snapshots
    WHERE id = ? AND agent_id = ? AND workspace_id IS ?`, checkpoint.snapshotId,
  object.agent_id, object.workspace_id);
  if (!row) return { valid: false, error: 'Linked organism snapshot is missing.' };
  let state;
  try { state = JSON.parse(row.state_json); } catch (_) { return { valid: false, error: 'Linked organism snapshot is invalid JSON.' }; }
  const integrity = require('../../controllers/lineage/snapshots').verifyOrganismSnapshot(state);
  const workspaceHash = state._genosSnapshot?.workspaceSnapshot?.hash || null;
  if (require('./checkpointBridgeValues1.cjs').verifyLinkValue1({ get checkpoint() { return checkpoint; }, integrity, workspaceHash })) {
    return { valid: false, error: 'Linked organism snapshot integrity mismatch.' };
  }
  return { valid: true, ...checkpoint, objectId: object.id };
}

module.exports = { linkCapture, linkCaptureIfEnabled, verifyLink };
