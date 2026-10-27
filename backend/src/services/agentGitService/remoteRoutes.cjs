'use strict';

const { getDatabase, withTransaction } = require('./agentGitDb.cjs');
const { assertRemoteGitUrl } = require('./pushTransport.cjs');
const { exportHistory, importHistory, trackingName, divergence, isAncestor } = require('./remoteSync.cjs');
const { updateRef } = require('./refs');
const { verifySource } = require('./verifiedMerge.cjs');

async function fetchRemote(req, remoteName) {
  const db = await getDatabase();
  const agentId = req.body?.agentId;
  const refName = req.body?.refName || 'main';
  const remoteUrl = await assertRemoteGitUrl(req.body.remoteUrl);
  if (!agentId) throw new Error('agentId is required for remote fetch.');
  const endpoint = new URL('/api/lineage/agents/git/remote/fetch', remoteUrl).href;
  const response = await globalThis.fetch(endpoint, { method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json', ...(req.body.remoteToken
      ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) },
    body: JSON.stringify({ agentId, refName, export: true }) });
  if (!response.ok) throw new Error(`Remote fetch failed with HTTP ${response.status}.`);
  const history = await response.json();
  if (history.agentId !== agentId || history.refName !== refName) throw new Error('Remote history ref mismatch.');
  const receipt = await importHistory(db, { ...req, body: { remoteName, importMode: 'fetch' } }, history);
  const local = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  return { success: true, operation: 'fetch', remoteName, receipt,
    tracking: await divergence(db, local?.object_id, history.headObjectId) };
}

async function fetch(req) {
  const db = await getDatabase();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  if (req.body?.export === true) {
    return exportHistory({ db, req, agentId: req.body?.agentId, refName: req.body?.refName || 'main' });
  }
  if (req.body?.remoteUrl) return fetchRemote(req, remoteName);
  const scope = require('./scopeSql.cjs').scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.id, o.agent_id, o.state_hash, o.ref_name, o.created_at
    FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id
    WHERE o.object_kind = 'remote' AND o.remote_name = ? AND ${scope.clause}
    ORDER BY o.created_at DESC`, remoteName, ...scope.params);
  return { success: true, operation: 'fetch', remoteName, objects };
}

async function pull(req) {
  const db = await getDatabase();
  const { getObject } = require('./index');
  const agentId = req.body?.targetAgentId || req.body?.agentId;
  const refName = req.body?.refName || 'main';
  const remoteName = req.body?.remoteName || 'default';
  if (!agentId || req.body?.sections) return { success: false, error: 'A target agent and full-state pull are required.' };
  const tracked = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    agentId, trackingName(remoteName, refName));
  const objectId = req.body?.objectId || tracked?.object_id;
  if (!tracked?.object_id || objectId !== tracked.object_id) {
    return { success: false, error: 'Pull requires the current tracked remote tip.' };
  }
  const object = await getObject(db, req, objectId);
  if (!object || object.agent_id !== agentId || verifySource(object).length) {
    return { success: false, error: 'Tracked remote tip failed scoped verification.' };
  }
  const local = await db.get('SELECT object_id, version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  if (!await isAncestor(db, local?.object_id, objectId)) {
    return { success: false, error: 'Local and remote refs diverged; use a verified merge.' };
  }
  await withTransaction(db, async () => {
    await require('./dagOperations').replaceState(req, { targetAgentId: agentId,
      state: JSON.parse(object.state_json), sections: ['agent', 'decisions', 'memories', 'runs',
        'plasmids', 'permissions', 'relations', 'epistemicClaims'] }, { inTransaction: true });
    await updateRef({ db, req, agentId, refName, objectId,
      options: { action: 'pull', expectedVersion: Number(local?.version || 0), inTransaction: true } });
  });
  return { success: true, operation: 'pull', objectId, stateHash: object.state_hash,
    tracking: { ahead: 0, behind: 0, known: true } };
}

module.exports = { fetch, pull };
