'use strict';

const { assertRemoteGitUrl, scopeSql } = require('./index');

async function checkPushVersion(req, db, agentId) {
  const currentRef = await db.get('SELECT version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, req.body?.refName || 'main');
  if (req.body?.force !== true && req.body?.expectedVersion != null && Number(req.body.expectedVersion) !== Number(currentRef?.version || 0)) {
    throw Object.assign(new Error('Push rejected: remote tracking ref diverged.'), { code: 'AGENT_PUSH_NON_FAST_FORWARD' });
  }
}

async function performRemotePush(opts) {
  const { req, url, commit, state } = opts;
  await assertRemoteGitUrl(url);
  const response = await globalThis.fetch(`${String(url).replace(/\/$/, '')}/api/lineage/agents/git/remote/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(req.body.remoteToken ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) },
    body: JSON.stringify({ ...req.body, objectId: commit.id, object: commit, state })
  });
  if (!response.ok) throw new Error(`Remote push failed with HTTP ${response.status}.`);
}

async function push(req, { createCommit, collectState, enforceHooks, getDatabase }) {
  const agentId = String(req.body?.agentId || '').trim();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const db = await getDatabase();
  await enforceHooks({ db, agentId, hookName: 'pre-push', context: await collectState(db, req, agentId) });
  await checkPushVersion(req, db, agentId);
  const commit = await createCommit(req, { agentId, kind: 'remote', refName: req.body?.refName || 'main', remoteName, metadata: { pushed: true, remoteUrl: req.body?.remoteUrl || null } });
  if (req.body?.remoteUrl) {
    const state = await collectState(await getDatabase(), req, agentId);
    await performRemotePush({ req, url: req.body.remoteUrl, commit, state });
  }
  return { success: true, operation: 'push', remoteName, force: req.body?.force === true, tracking: { ahead: 1, behind: 0 }, ...commit };
}

async function fetchRemote(req, { collectState, getDatabase }) {
  const db = await getDatabase();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.id, o.agent_id, o.state_hash, o.ref_name, o.created_at FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.object_kind = 'remote' AND o.remote_name = ? AND ${scope.clause} ORDER BY o.created_at DESC`, remoteName, ...scope.params);
  if (!req.body?.remoteUrl) return { success: true, operation: 'fetch', remoteName, objects };
  await assertRemoteGitUrl(req.body.remoteUrl);
  const response = await globalThis.fetch(`${String(req.body.remoteUrl).replace(/\/$/, '')}/api/lineage/agents/git/remote/fetch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(req.body.remoteToken ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) },
    body: JSON.stringify({ ...req.body, remoteName })
  });
  if (!response.ok) throw new Error(`Remote fetch failed with HTTP ${response.status}.`);
  return { success: true, operation: 'fetch', remoteName, remote: await response.json(), objects };
}

module.exports = { push, fetch: fetchRemote };
