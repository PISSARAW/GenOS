async function updateRef({ db, req, agentId, refName, objectId, options = {} }) {
  const scope = require('./index').scopeSql(req, 'w');
  const current = await db.get(`SELECT r.* FROM agent_git_refs r LEFT JOIN agents a ON a.id = r.agent_id LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE r.agent_id = ? AND r.ref_name = ? AND ${scope.clause}`, agentId, refName, ...scope.params);
  if (current && options.expectedVersion != null && Number(options.expectedVersion) !== Number(current.version)) throw Object.assign(new Error('Remote ref changed concurrently.'), { code: 'AGENT_REF_CONFLICT' });
  if (current?.lease_token && options.leaseToken && current.lease_token !== options.leaseToken) throw Object.assign(new Error('Ref lease is held by another writer.'), { code: 'AGENT_REF_LEASE_CONFLICT' });
  const version = Number(current?.version || 0) + 1;
  await db.run(`INSERT INTO agent_git_refs (ref_key, agent_id, ref_name, object_id, version, lease_token, tracking_remote, tracking_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ref_key) DO UPDATE SET object_id = excluded.object_id, version = excluded.version, lease_token = excluded.lease_token, updated_at = CURRENT_TIMESTAMP`, `${agentId}:${refName}`, agentId, refName, objectId, version, options.leaseToken || current?.lease_token || null, options.trackingRemote || current?.tracking_remote || null, options.trackingRef || current?.tracking_ref || null);
  await db.run('INSERT INTO agent_git_reflog (id, agent_id, ref_name, old_object_id, new_object_id, action, actor) VALUES (?, ?, ?, ?, ?, ?, ?)', `reflog-${Date.now()}-${require('crypto').randomBytes(3).toString('hex')}`, agentId, refName, current?.object_id || null, objectId, options.action || 'update', req.user?.username || 'agent-git');
  return { version, oldObjectId: current?.object_id || null };
}

module.exports = { updateRef };
