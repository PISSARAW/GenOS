'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { validateProviderEndpointAsync } = require('../providerEndpointPolicy');
const { wireObject } = require('./wireFormat.cjs');

async function assertRemoteGitUrl(rawUrl) {
  if (process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES === '1') return;
  await validateProviderEndpointAsync(String(rawUrl), { localOnly: false });
}

async function performRemotePush(opts) {
  const { req, remoteUrl, commit, state } = opts;
  const remotePath = `${String(remoteUrl).replace(/\/$/, '')}/api/lineage/agents/git/remote/push`;
  const response = await globalThis.fetch(remotePath, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(req.body.remoteToken ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) },
    body: JSON.stringify({ ...req.body, objectId: commit.id, object: wireObject(commit), state })
  });
  if (!response.ok) throw new Error(`Remote push failed with HTTP ${response.status}.`);
}

async function executeRemotePush(req, agentId, commit) {
  await assertRemoteGitUrl(req.body.remoteUrl);
  const db = await getDatabase();
  const stored = await db.get('SELECT state_json FROM agent_git_objects WHERE id = ?', commit.id);
  if (!stored) throw Object.assign(new Error('Pushed commit not found in local store.'), { code: 'COMMIT_NOT_FOUND' });
  await performRemotePush({ req, remoteUrl: req.body.remoteUrl, commit, state: JSON.parse(stored.state_json) });
}

async function resolvePushTip(ctx) {
  const { db, req, agentId, refName } = ctx;
  const ref = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  if (ref?.object_id) {
    const commit = await loadTipCommit({ db, ref });
    if (commit) return { commit, bootstrapped: false };
  }
  const { createCommit } = require('./index');
  const created = await createCommit(req, { agentId, kind: 'commit', refName, metadata: { pushBootstrap: true } });
  return { commit: created, bootstrapped: true };
}

async function loadTipCommit(ctx) {
  const { db, ref } = ctx;
  const row = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', ref.object_id);
  if (!row) return null;
  const parents = await db.all('SELECT parent_commit_id FROM agent_git_commit_parents WHERE commit_id = ? ORDER BY position, rowid', row.id);
  return {
    id: row.id, agentId: row.agent_id, workspaceId: row.workspace_id, refName: row.ref_name,
    stateHash: row.state_hash, treeHash: row.tree_hash, commitHash: row.commit_hash,
    parentCommitIds: parents.map(p => p.parent_commit_id),
    signature: row.signature, signatureAlgorithm: row.signature_algorithm,
    authorKeyId: row.author_key_id, publicKeyFingerprint: row.public_key_fingerprint,
    commitEnvelope: row.signed_commit_envelope, metadataJson: row.metadata_json
  };
}

async function recordPushReceipt(ctx) {
  const { db, req, agentId, refName, remoteName, commitId } = ctx;
  const noteId = `agent-note-push-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const receipt = { kind: 'push-receipt', remoteName, refName, commitId, pushedAt: new Date().toISOString(), remoteUrl: req.body?.remoteUrl || null };
  try {
    await db.run('INSERT INTO agent_git_notes (id, object_id, agent_id, note_json, created_by) VALUES (?, ?, ?, ?, ?)', noteId, commitId, agentId, JSON.stringify(receipt), req.user?.username || 'agent-git');
  } catch (_) {}
  try {
    await db.run('UPDATE agent_git_refs SET tracking_remote = ?, tracking_ref = ? WHERE agent_id = ? AND ref_name = ?', remoteName, refName, agentId, refName);
  } catch (_) {}
}

module.exports = { assertRemoteGitUrl, performRemotePush, executeRemotePush, resolvePushTip, loadTipCommit, recordPushReceipt };
