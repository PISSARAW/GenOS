'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { validateProviderEndpointAsync } = require('../providerEndpointPolicy');
const { enforceHooks } = require('./hooks');
const { applyState } = require('./state');
const { updateRef } = require('./refs');
const { treeHash, commitHash } = require('./canonical');
const { storeObject } = require('./storeObjectHelper.cjs');
const causalOps = require('./causalOps.cjs');
const { verifyRemoteObject } = require('./remoteVerification.cjs');
const { wireObject } = require('./wireFormat.cjs');

// Agent Git remotes are fetched server-side, so a caller-controlled remoteUrl
// is an SSRF vector. Reuse the provider endpoint policy (blocks loopback,
// private ranges and metadata addresses) unless an operator explicitly opts
// into private remotes for a trusted self-hosted topology.
async function assertRemoteGitUrl(rawUrl) {
  if (process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES === '1') return;
  await validateProviderEndpointAsync(String(rawUrl), { localOnly: false });
}

function scopeSql(req, alias = 'w') {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
}

function hashState(state) {
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

function signingSecret() {
  const secret = process.env.GENOS_AGENT_GIT_SIGNING_SECRET || process.env.GENOS_GRPC_SHARED_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('GENOS_AGENT_GIT_SIGNING_SECRET or GENOS_GRPC_SHARED_SECRET must be configured in production');
    }
    return 'genos-agent-git-development-secret';
  }
  return secret;
}

function signingPayload(stateHash, metadata) {
  return Buffer.from(`${stateHash}:${JSON.stringify(metadata || {})}`);
}

function signingAlgorithm() {
  return process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY ? 'ed25519' : 'hmac-sha256';
}

function signObject(stateHash, metadata) {
  const payload = signingPayload(stateHash, metadata);
  if (signingAlgorithm() === 'ed25519') return crypto.sign(null, payload, process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY).toString('base64');
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex');
}

function verifyObjectSignature(object) {
  if (!object.signature) return false;
  // Utiliser l'algorithme stocké dans signature_algorithm (auto-descriptif)
  // avec fallback sur la configuration courante pour les anciens objets
  const isEd25519 = (object.signature_algorithm || signingAlgorithm()) === 'ed25519';
  const authHash = object.commit_hash || object.tree_hash || object.state_hash;
  const expected = Buffer.from(signObject(authHash, json(object.metadata_json, {})), isEd25519 ? 'base64' : 'utf8');
  const actual = Buffer.from(object.signature, isEd25519 ? 'base64' : 'utf8');
  if (actual.length !== expected.length) return false;
  if (isEd25519) return crypto.verify(null, signingPayload(authHash, json(object.metadata_json, {})), process.env.GENOS_AGENT_GIT_SIGNING_PUBLIC_KEY || process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY, actual);
  return crypto.timingSafeEqual(actual, expected);
}

function json(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function loadAgent(db, req, agentId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT a.* FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, agentId, ...scope.params);
}

async function collectState(db, req, agentId) {
  const agent = await loadAgent(db, req, agentId);
  if (!agent) return null;
  const [decisions, memories, runs, plasmids, permissions, events, children] = await Promise.all([
    db.all('SELECT id, title, content, cart_nodes_json, category, synaptic_weight, organization_id, project_id, created_at FROM genome_decisions WHERE created_by = ? ORDER BY created_at, id', agentId),
    db.all('SELECT * FROM episodic_memories WHERE agent_id = ? ORDER BY created_at, id', agentId).catch(() => []),
    db.all('SELECT id, contract_id, contract_version, status, budget_json, metrics_json, created_at FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at, id', agentId).catch(() => []),
    db.all('SELECT * FROM plasmid_bindings WHERE owner_agent_id = ? ORDER BY created_at, plasmid_id', agentId).catch(() => []),
    db.all('SELECT agent_id, permissions_json, denied_tools_json, organization_id, project_id FROM agent_permissions WHERE agent_id = ?', agentId).catch(() => []),
    db.all('SELECT event_id, event_type, action, detail, payload_json, severity, organization_id, project_id, created_at FROM telemetry_events WHERE agent_id = ? ORDER BY created_at, id LIMIT 1000', agentId).catch(() => []),
    db.all('SELECT id, name, role, status, lineage_relation FROM agents WHERE parent_agent_id = ? ORDER BY created_at, id', agentId).catch(() => [])
  ]);
  return {
    schema: 'genos.agent-git-state/v1',
    agent,
    decisions,
    memories,
    runs,
    plasmids,
    permissions,
    events,
    children,
    capturedAt: new Date().toISOString()
  };
}

function changedSections(left, right) {
  const sections = ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions', 'events', 'children'];
  return sections.filter((section) => JSON.stringify(left?.[section]) !== JSON.stringify(right?.[section]));
}

async function getObject(db, req, objectId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

async function createCommit(req, options = {}) {
  const db = await getDatabase();
  const state = options.state || await collectState(db, req, options.agentId);
  if (!state) throw Object.assign(new Error('Agent is not available in the current tenant.'), { code: 'AGENT_NOT_FOUND' });
  await enforceHooks({ db, agentId: options.agentId, hookName: 'pre-commit', context: state });
  await enforceHooks({ db, agentId: options.agentId, hookName: 'signature-required', context: state });
  const refName = options.refName || 'main';
  const currentRef = await db.get('SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', options.agentId, refName);
  const parentCommitId = currentRef?.object_id || null;
  const result = await storeObject(db, { agentId: options.agentId, workspaceId: state.agent.workspace_id, kind: options.kind || 'commit', refName, remoteName: options.remoteName, state, createdBy: req.user?.username || 'agent-git', metadata: options.metadata || {}, parentCommitId });
  await updateRef({ db, req, agentId: options.agentId, refName, objectId: result.id, options: { expectedVersion: options.expectedVersion, leaseToken: options.leaseToken, action: options.kind || 'commit' } });
  return { ...result, parentCommitId };
}

async function performRemotePush(opts) {
  const { req, remoteUrl, commit, state } = opts;
  const remotePath = `${String(remoteUrl).replace(/\/$/, '')}/api/lineage/agents/git/remote/push`;
  const response = await globalThis.fetch(remotePath, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(req.body.remoteToken ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) },
    // Point 3 : format wire canonical unique (snake_case). L'état envoyé est
    // EXACTEMENT celui du commit — pas un collectState frais dont le hash
    // différerait de la signature vérifiée par le receiver.
    body: JSON.stringify({ ...req.body, objectId: commit.id, object: wireObject(commit), state })
  });
  if (!response.ok) throw new Error(`Remote push failed with HTTP ${response.status}.`);
}

async function checkPushVersion(req, db, agentId) {
  const currentRef = await db.get('SELECT version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, req.body?.refName || 'main');
  if (req.body?.force !== true && req.body?.expectedVersion != null && Number(req.body.expectedVersion) !== Number(currentRef?.version || 0)) {
    throw Object.assign(new Error('Push rejected: remote tracking ref diverged.'), { code: 'AGENT_PUSH_NON_FAST_FORWARD' });
  }
}

async function executeRemotePush(req, agentId, commit) {
  await assertRemoteGitUrl(req.body.remoteUrl);
  const state = await collectState(await getDatabase(), req, agentId);
  await performRemotePush({ req, remoteUrl: req.body.remoteUrl, commit, state });
}

async function push(req) {
  const agentId = String(req.body?.agentId || '').trim();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const db = await getDatabase();
  await enforceHooks({ db, agentId, hookName: 'pre-push', context: await collectState(db, req, agentId) });
  await checkPushVersion(req, db, agentId);
  const commit = await createCommit(req, { agentId, kind: 'remote', refName: req.body?.refName || 'main', remoteName, metadata: { pushed: true, remoteUrl: req.body?.remoteUrl || null } });
  if (req.body?.remoteUrl) await executeRemotePush(req, agentId, commit);
  return { success: true, operation: 'push', remoteName, force: req.body?.force === true, tracking: { ahead: 1, behind: 0 }, ...commit };
}

async function fetch(req) {
  const db = await getDatabase();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.id, o.agent_id, o.state_hash, o.ref_name, o.created_at FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.object_kind = 'remote' AND o.remote_name = ? AND ${scope.clause} ORDER BY o.created_at DESC`, remoteName, ...scope.params);
  if (!req.body?.remoteUrl) return { success: true, operation: 'fetch', remoteName, objects };
  await assertRemoteGitUrl(req.body.remoteUrl);
  const fetchPath = `${String(req.body.remoteUrl).replace(/\/$/, '')}/api/lineage/agents/git/remote/fetch`;
  const response = await globalThis.fetch(fetchPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(req.body.remoteToken ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) },
    body: JSON.stringify({ ...req.body, remoteName })
  });
  if (!response.ok) throw new Error(`Remote fetch failed with HTTP ${response.status}.`);
  return { success: true, operation: 'fetch', remoteName, remote: await response.json(), objects };
}


async function quarantineIncoming(db, opts) {
  const { incoming, state, reason } = opts;
  const id = `agent-git-quarantine-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const sql = 'INSERT INTO agent_git_quarantine (id, remote_name, incoming_id, reason, state_json, signature) VALUES (?, ?, ?, ?, ?, ?)';
  await db.run(sql, id, incoming.remoteName || 'unknown', incoming.id, reason, JSON.stringify(state), incoming.signature || null);
  return { quarantined: true, quarantineId: id, reason };
}

async function checkRemoteParents(db, incoming, state) {
  const parentIds = incoming.parent_commit_ids || incoming.parentCommitIds || [];
  for (const parentId of parentIds) {
    const parent = await db.get('SELECT id FROM agent_git_objects WHERE id = ?', parentId);
    if (!parent) {
      const q = await quarantineIncoming(db, { incoming, state, reason: `missing_parent:${parentId}` });
      return { success: false, error: `Missing parent commit: ${parentId}`, ...q };
    }
  }
  return null;
}

async function receiveRemote(req) {
  const incoming = req.body?.object;
  const state = req.body?.state || null;
  const verification = await verifyRemoteObject(incoming, state);
  const db = await getDatabase();
  if (!verification.valid) {
    // Mettre en quarantine pour inspection manuelle
    const q = await quarantineIncoming(db, { incoming, state, reason: verification.error });
    return { success: false, error: verification.error, ...q };
  }
  // Vérifier que les parents sont disponibles (fast-forward check)
  const parentFailure = await checkRemoteParents(db, incoming, state);
  if (parentFailure) return parentFailure;
  const stored = await storeObject(db, { agentId: incoming.agent_id || incoming.agentId, workspaceId: incoming.workspace_id || incoming.workspaceId, kind: 'remote', refName: incoming.ref_name || incoming.refName, remoteName: req.body?.remoteName || 'default', state, createdBy: req.user?.username || 'remote', metadata: { receivedFrom: req.ip || 'remote', sourceObjectId: incoming.id }, locked: true });
  return { success: true, operation: 'remote-receive', ...stored };
}

async function pull(req) {
  const db = await getDatabase();
  const object = await getObject(db, req, req.body?.objectId);
  if (!object || object.object_kind !== 'remote') return { success: false, error: 'Remote agent object not found.' };
  const state = JSON.parse(object.state_json);
  await applyState(db, req, req.body?.targetAgentId || object.agent_id, state, req.body?.sections);
  return { success: true, operation: 'pull', objectId: object.id, stateHash: object.state_hash };
}

async function stash(req) { return { success: true, operation: 'stash', ...(await createCommit(req, { agentId: req.body?.agentId, kind: 'stash', refName: req.body?.refName || 'stash' })) }; }
async function tag(req) {
  const db = await getDatabase();
  const existing = await db.get('SELECT metadata_json FROM agent_git_objects WHERE agent_id = ? AND object_kind = \'tag\' AND ref_name = ?', req.body?.agentId, req.body?.tagName);
  if (existing && json(existing.metadata_json, {}).locked) throw Object.assign(new Error('Tag is locked and cannot be overwritten.'), { code: 'AGENT_TAG_LOCKED' });
  return { success: true, operation: 'tag', ...(await createCommit(req, { agentId: req.body?.agentId, kind: 'tag', refName: req.body?.tagName, metadata: { stable: true }, locked: req.body?.locked !== false })) };
}


async function diff(req) {
  const db = await getDatabase();
  const left = await collectState(db, req, req.body?.leftAgentId);
  const right = await collectState(db, req, req.body?.rightAgentId);
  if (!left || !right) return { success: false, error: 'Both agents must exist in the current tenant.' };
  const sections = changedSections(left, right);
  return { success: true, operation: 'diff', leftAgentId: left.agent.id, rightAgentId: right.agent.id, identical: sections.length === 0, changedSections: sections, hashes: { left: hashState(left), right: hashState(right) }, summary: sections.map((section) => ({ section, leftCount: Array.isArray(left[section]) ? left[section].length : 1, rightCount: Array.isArray(right[section]) ? right[section].length : 1 })) };
}

async function merge(req) {
  const { merge: dagMerge } = require('./gitOperations');
  return dagMerge(req);
}

async function replay(req) { return causalOps.replay(req); }

async function log(req) {
  const db = await getDatabase();
  const scope = scopeSql(req, 'w');
  const rows = await db.all(`SELECT o.id, o.agent_id, o.object_kind, o.ref_name, o.remote_name, o.state_hash, o.signature, o.metadata_json, o.created_by, o.created_at FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND ${scope.clause} ORDER BY o.created_at DESC, o.id DESC LIMIT ?`, req.body?.agentId, Math.min(1000, Math.max(1, Number(req.body?.limit || 100))), ...scope.params);
  return { success: true, operation: 'log', agentId: req.body?.agentId, objects: rows.map((row) => ({ ...row, metadata: json(row.metadata_json, {}), signatureValid: verifyObjectSignature(row) })) };
}

async function revert(req) {
  const { revert: dagRevert } = require('./gitOperations');
  return dagRevert(req);
}

async function rebase(req) {
  const { rebase: dagRebase } = require('./gitOperations');
  return dagRebase(req);
}

async function reflog(req) {
  const db = await getDatabase(); const scope = scopeSql(req, 'w');
  const rows = await db.all(`SELECT r.* FROM agent_git_reflog r LEFT JOIN agents a ON a.id = r.agent_id LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE r.agent_id = ? AND ${scope.clause} ORDER BY r.created_at DESC LIMIT ?`, req.body?.agentId, ...scope.params, Math.min(1000, Number(req.body?.limit || 100)));
  return { success: true, operation: 'reflog', entries: rows };
}

async function show(req) {
  const db = await getDatabase(); const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  return { success: true, operation: 'show', object: { ...object, state: JSON.parse(object.state_json), metadata: json(object.metadata_json, {}), signatureValid: verifyObjectSignature(object) } };
}

async function fsck(req) { return causalOps.fsck(req); }

async function describe(req) {
  const db = await getDatabase(); const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const scope = scopeSql(req, 'w');
  const count = await db.get(`SELECT COUNT(*) AS count FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND o.created_at <= ? AND ${scope.clause}`, object.agent_id, object.created_at, ...scope.params);
  return { success: true, operation: 'describe', version: `${object.ref_name || 'main'}-${count?.count || 1}-g${object.state_hash.slice(0, 12)}`, objectId: object.id, stateHash: object.state_hash };
}

async function gc(req) {
  const db = await getDatabase(); const keep = Math.max(1, Number(req.body?.keep || 20));
  const scope = scopeSql(req, 'w'); const rows = await db.all(`SELECT o.id FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND o.object_kind IN ('stash', 'remote') AND ${scope.clause} ORDER BY o.created_at DESC`, req.body?.agentId, ...scope.params);
  const stale = rows.slice(keep); for (const row of stale) await db.run('DELETE FROM agent_git_objects WHERE id = ?', row.id);
  return { success: true, operation: 'gc', pruned: stale.length, kept: Math.min(keep, rows.length) };
}

async function blame(req) { return causalOps.blame(req); }

async function note(req) {
  const db = await getDatabase(); const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const id = `agent-note-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await db.run('INSERT INTO agent_git_notes (id, object_id, agent_id, note_json, created_by) VALUES (?, ?, ?, ?, ?)', id, object.id, object.agent_id, JSON.stringify(req.body?.note || {}), req.user?.username || 'agent-git');
  return { success: true, operation: 'note', noteId: id, objectId: object.id };
}

async function hook(req) {
  const db = await getDatabase(); const agentId = String(req.body?.agentId || '').trim(); const hookName = String(req.body?.hookName || '').trim();
  if (!agentId || !['pre-commit', 'pre-push', 'merge-validation', 'signature-required'].includes(hookName)) return { success: false, error: 'Valid agentId and hookName are required.' };
  await db.run('INSERT OR REPLACE INTO agent_git_hooks (hook_key, agent_id, hook_name, policy_json, enabled) VALUES (?, ?, ?, ?, ?)', `${agentId}:${hookName}`, agentId, hookName, JSON.stringify(req.body?.policy || {}), req.body?.enabled === false ? 0 : 1);
  return { success: true, operation: 'hook', agentId, hookName, enabled: req.body?.enabled !== false };
}

async function mergeBase(req) {
  const { mergeBase: dagMergeBase } = require('./dagOperations');
  return dagMergeBase(req);
}

async function archive(req) {
  const db = await getDatabase(); const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const payload = JSON.stringify({ objectId: object.id, state: JSON.parse(object.state_json), signature: object.signature }); const archiveHash = hashState(payload);
  const id = `agent-archive-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await db.run('INSERT INTO agent_git_archives (id, agent_id, object_id, archive_hash, archive_json, created_by) VALUES (?, ?, ?, ?, ?, ?)', id, object.agent_id, object.id, archiveHash, payload, req.user?.username || 'agent-git');
  return { success: true, operation: 'archive', archiveId: id, archiveHash, objectId: object.id };
}

async function bisect(req) {
  const { bisect: dagBisect } = require('./bisect.cjs');
  return dagBisect(req);
}

async function cherryPick(req) {
  const { cherryPick: dagCherryPick } = require('./gitOperations');
  return dagCherryPick(req);
}

module.exports = {
  hashState, signObject, collectState, changedSections, createCommit, push, fetch, receiveRemote, pull, stash, tag, cherryPick, diff, merge, replay, bisect, log, show, fsck, gc, blame, note, hook, mergeBase, archive, revert, rebase, applyState, getObject,
  enforceHooks, updateRef, scopeSql, loadAgent, verifyObjectSignature, json, treeHash, commitHash,
  // DAG + HEAD/Index operations
  reset: require('./dagOperations').reset, replaceState: require('./dagOperations').replaceState,
  computePatch: require('./dagOperations').computePatch, applyPatch: require('./dagOperations').applyPatch,
  mergeBaseDag: require('./dagOperations').mergeBase,
  stage: require('./headIndexWrappers.cjs').stage, unstage: require('./headIndexWrappers.cjs').unstage,
  status: require('./headIndex.cjs').status, commitFromIndex: require('./commitFromIndex.cjs'),
  rebaseInteractive: require('./rebaseInteractive.cjs'),
  // Biomimetic operations (point 8)
  hgtCherryPick: require('./biomimeticOps.cjs').hgtCherryPick,
  speciation: require('./biomimeticOps.cjs').speciation,
  recombination: require('./biomimeticOps.cjs').recombination,
  migration: require('./biomimeticOps.cjs').migration,
  fossil: require('./biomimeticOps.cjs').fossil,
  apoptosis: require('./biomimeticOps.cjs').apoptosis
};
