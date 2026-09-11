const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { enforceHooks } = require('./hooks');
const { applyState } = require('./state');
const { updateRef } = require('./refs');

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
  const isEd25519 = signingAlgorithm() === 'ed25519';
  const expected = Buffer.from(signObject(object.state_hash, json(object.metadata_json, {})), isEd25519 ? 'base64' : 'utf8');
  const actual = Buffer.from(object.signature, isEd25519 ? 'base64' : 'utf8');
  if (actual.length !== expected.length) return false;
  if (isEd25519) return crypto.verify(null, signingPayload(object.state_hash, json(object.metadata_json, {})), process.env.GENOS_AGENT_GIT_SIGNING_PUBLIC_KEY || process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY, actual);
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

async function storeObject(db, { agentId, workspaceId, kind, refName, remoteName, state, createdBy, metadata = {}, locked = false }) {
  const id = `agent-git-${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const stateJson = JSON.stringify(state);
  const objectMetadata = { ...metadata, locked, stateSchema: state.schema, signatureAlgorithm: signingAlgorithm() };
  const stateHash = hashState(state);
  const signature = signObject(stateHash, objectMetadata);
  await db.run(
    `INSERT INTO agent_git_objects (id, agent_id, workspace_id, object_kind, ref_name, remote_name, state_hash, state_json, metadata_json, signature, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, agentId, workspaceId, kind, refName || null, remoteName || null, stateHash, stateJson, JSON.stringify(objectMetadata), signature, createdBy || 'agent-git'
  );
  return { id, agentId, workspaceId, kind, refName: refName || null, remoteName: remoteName || null, stateHash, signature };
}

async function getObject(db, req, objectId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

async function createCommit(req, options = {}) {
  const db = await getDatabase();
  const state = await collectState(db, req, options.agentId);
  if (!state) throw Object.assign(new Error('Agent is not available in the current tenant.'), { code: 'AGENT_NOT_FOUND' });
  await enforceHooks({ db, agentId: options.agentId, hookName: 'pre-commit', context: state });
  const result = await storeObject(db, { agentId: options.agentId, workspaceId: state.agent.workspace_id, kind: options.kind || 'commit', refName: options.refName || 'main', remoteName: options.remoteName, state, createdBy: req.user?.username || 'agent-git', metadata: options.metadata || {} });
  await updateRef({ db, req, agentId: options.agentId, refName: options.refName || 'main', objectId: result.id, options: { expectedVersion: options.expectedVersion, leaseToken: options.leaseToken, action: options.kind || 'commit' } });
  return result;
}

async function push(req) {
  const agentId = String(req.body?.agentId || '').trim();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const db = await getDatabase();
  await enforceHooks(db, agentId, 'pre-push', await collectState(db, req, agentId));
  const currentRef = await db.get('SELECT version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, req.body?.refName || 'main');
  if (req.body?.force !== true && req.body?.expectedVersion != null && Number(req.body.expectedVersion) !== Number(currentRef?.version || 0)) throw Object.assign(new Error('Push rejected: remote tracking ref diverged.'), { code: 'AGENT_PUSH_NON_FAST_FORWARD' });
  const commit = await createCommit(req, { agentId, kind: 'remote', refName: req.body?.refName || 'main', remoteName, metadata: { pushed: true, remoteUrl: req.body?.remoteUrl || null } });
  if (req.body?.remoteUrl) {
    const state = await collectState(await getDatabase(), req, agentId);
    const response = await fetch(`${String(req.body.remoteUrl).replace(/\/$/, '')}/api/lineage/agents/git/remote/push`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(req.body.remoteToken ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) },
      body: JSON.stringify({ ...req.body, objectId: commit.id, object: commit, state })
    });
    if (!response.ok) throw new Error(`Remote push failed with HTTP ${response.status}.`);
  }
  return { success: true, operation: 'push', remoteName, force: req.body?.force === true, tracking: { ahead: 1, behind: 0 }, ...commit };
}

async function fetch(req) {
  const db = await getDatabase();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.id, o.agent_id, o.state_hash, o.ref_name, o.created_at FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.object_kind = 'remote' AND o.remote_name = ? AND ${scope.clause} ORDER BY o.created_at DESC`, remoteName, ...scope.params);
  if (req.body?.remoteUrl) {
    const response = await fetch(`${String(req.body.remoteUrl).replace(/\/$/, '')}/api/lineage/agents/git/remote/fetch`, { method: 'POST', headers: { 'content-type': 'application/json', ...(req.body.remoteToken ? { authorization: `Bearer ${req.body.remoteToken}` } : {}) }, body: JSON.stringify({ ...req.body, remoteName }) });
    if (!response.ok) throw new Error(`Remote fetch failed with HTTP ${response.status}.`);
    return { success: true, operation: 'fetch', remoteName, remote: await response.json(), objects };
  }
  return { success: true, operation: 'fetch', remoteName, objects };
}

async function receiveRemote(req) {
  const incoming = req.body?.object;
  if (!incoming?.id || !incoming.stateHash) return { success: false, error: 'Signed remote object is required.' };
  const db = await getDatabase();
  const state = req.body?.state || null;
  if (!state) return { success: false, error: 'Remote state payload is required.' };
  const stored = await storeObject(db, { agentId: incoming.agentId, workspaceId: incoming.workspaceId, kind: 'remote', refName: incoming.refName, remoteName: req.body?.remoteName || 'default', state, createdBy: req.user?.username || 'remote', metadata: { receivedFrom: req.ip || 'remote', sourceObjectId: incoming.id }, locked: true });
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

async function cherryPick(req) {
  const db = await getDatabase();
  const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const state = JSON.parse(object.state_json);
  const result = await applyState(db, req, req.body?.targetAgentId, state, req.body?.sections || ['decisions', 'memories', 'plasmids', 'permissions']);
  return { success: true, operation: 'cherry-pick', objectId: object.id, ...result };
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
  const db = await getDatabase();
  const left = await collectState(db, req, req.body?.leftAgentId);
  const right = await collectState(db, req, req.body?.rightAgentId);
  if (!left || !right) return { success: false, error: 'Both agents must exist in the current tenant.' };
  if (left.agent.workspace_id !== right.agent.workspace_id) return { success: false, error: 'Agents must share a workspace.' };
  const unique = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];
  const conflicts = [];
  if (left.agent.role !== right.agent.role && req.body?.role == null) conflicts.push({ section: 'strategy', field: 'role', left: left.agent.role, right: right.agent.role });
  if (left.agent.model_tier !== right.agent.model_tier && req.body?.modelTier == null) conflicts.push({ section: 'runtime', field: 'model_tier', left: left.agent.model_tier, right: right.agent.model_tier });
  if (conflicts.length && req.body?.resolution !== 'ours' && req.body?.resolution !== 'theirs') return { success: false, operation: 'merge', conflict: true, conflicts, resolutionRequired: true };
  const winner = req.body?.resolution === 'theirs' ? right : left;
  const merged = {
    ...left,
    agent: { ...winner.agent, name: req.body?.name || `Merge of ${left.agent.name} + ${right.agent.name}`, role: req.body?.role || winner.agent.role, cognitive_budget: Math.min(Number(left.agent.cognitive_budget || 0), Number(right.agent.cognitive_budget || 0)), dissonance_level: Math.max(Number(left.agent.dissonance_level || 0), Number(right.agent.dissonance_level || 0)) },
    decisions: unique([...left.decisions, ...right.decisions], (item) => `${item.title}:${item.content}`),
    memories: unique([...left.memories, ...right.memories], (item) => `${item.action_input}:${item.observation_output}:${item.created_at}`),
    runs: unique([...left.runs, ...right.runs], (item) => item.id),
    plasmids: unique([...left.plasmids, ...right.plasmids], (item) => item.plasmid_id),
    permissions: unique([...left.permissions, ...right.permissions], (item) => `${item.organization_id}:${item.project_id}`)
  };
  const result = await applyState(db, req, req.body?.targetAgentId || left.agent.id, merged, ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']);
  const object = await storeObject(db, { agentId: result.targetAgentId, workspaceId: merged.agent.workspace_id, kind: 'commit', refName: 'merge', state: merged, createdBy: req.user?.username || 'agent-git', metadata: { mergeParents: [left.agent.id, right.agent.id] } });
  return { success: true, operation: 'merge', ...result, ...object, parentAgentIds: [left.agent.id, right.agent.id], conflictsResolved: conflicts.length };
}

async function replay(req) {
  const db = await getDatabase();
  const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const state = JSON.parse(object.state_json);
  const digest = hashState(state);
  const events = Array.isArray(state.events) ? state.events : [];
  return { success: true, operation: 'replay', objectId: object.id, replayVerified: digest === object.state_hash && verifyObjectSignature(object), state, stateHash: digest, runtimeReplay: { eventCount: events.length, ordered: events.every((event, index, all) => index === 0 || String(all[index - 1].created_at) <= String(event.created_at)), events }, applied: false };
}

async function log(req) {
  const db = await getDatabase();
  const scope = scopeSql(req, 'w');
  const rows = await db.all(`SELECT o.id, o.agent_id, o.object_kind, o.ref_name, o.remote_name, o.state_hash, o.signature, o.metadata_json, o.created_by, o.created_at FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND ${scope.clause} ORDER BY o.created_at DESC, o.id DESC LIMIT ?`, req.body?.agentId, Math.min(1000, Math.max(1, Number(req.body?.limit || 100))), ...scope.params);
  return { success: true, operation: 'log', agentId: req.body?.agentId, objects: rows.map((row) => ({ ...row, metadata: json(row.metadata_json, {}), signatureValid: verifyObjectSignature(row) })) };
}

async function revert(req) {
  const db = await getDatabase();
  const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const current = await collectState(db, req, req.body?.targetAgentId || object.agent_id);
  const target = JSON.parse(object.state_json);
  const inverse = { ...current, agent: current.agent, decisions: (current.decisions || []).filter((item) => !(target.decisions || []).some((candidate) => candidate.id === item.id)), memories: (current.memories || []).filter((item) => !(target.memories || []).some((candidate) => candidate.id === item.id)) };
  const result = await applyState(db, req, req.body?.targetAgentId || object.agent_id, inverse, ['decisions', 'memories']);
  const commit = await storeObject(db, { agentId: result.targetAgentId, workspaceId: current.agent.workspace_id, kind: 'commit', refName: req.body?.refName || 'main', state: inverse, createdBy: req.user?.username || 'agent-git', metadata: { revertOf: object.id, inverse: true } });
  return { success: true, operation: 'revert', revertedObjectId: object.id, ...result, ...commit };
}

async function rebase(req) {
  const db = await getDatabase();
  const ours = await getObject(db, req, req.body?.oursObjectId);
  const onto = await getObject(db, req, req.body?.ontoObjectId);
  if (!ours || !onto) return { success: false, error: 'Both rebase objects are required.' };
  const oursState = JSON.parse(ours.state_json); const ontoState = JSON.parse(onto.state_json);
  const conflicts = changedSections(oursState, ontoState).filter((section) => section !== 'capturedAt').map((section) => ({ section, ours: oursState[section], onto: ontoState[section] }));
  if (conflicts.length && req.body?.resolution !== 'ours' && req.body?.resolution !== 'onto') return { success: false, operation: 'rebase', conflict: true, conflicts, resolutionRequired: true };
  const base = req.body?.resolution === 'onto' ? ontoState : oursState;
  const result = await applyState(db, req, req.body?.targetAgentId || ours.agent_id, base, req.body?.sections || ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']);
  const commit = await storeObject(db, { agentId: result.targetAgentId, workspaceId: base.agent.workspace_id, kind: 'commit', refName: req.body?.refName || ours.ref_name || 'main', state: base, createdBy: req.user?.username || 'agent-git', metadata: { rebaseFrom: ours.id, rebaseOnto: onto.id, conflictsResolved: conflicts.length } });
  return { success: true, operation: 'rebase', ...result, ...commit, conflictsResolved: conflicts.length };
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

async function fsck(req) {
  const db = await getDatabase(); const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND ${scope.clause}`, req.body?.agentId, ...scope.params);
  const issues = [];
  for (const object of objects) {
    let state; try { state = JSON.parse(object.state_json); } catch (_) { issues.push({ id: object.id, issue: 'invalid_json' }); continue; }
    if (hashState(state) !== object.state_hash) issues.push({ id: object.id, issue: 'state_hash_mismatch' });
    if (!verifyObjectSignature(object)) issues.push({ id: object.id, issue: 'invalid_signature' });
    const metadata = json(object.metadata_json, {});
    if (metadata.parentObjectId && !objects.some((candidate) => candidate.id === metadata.parentObjectId)) issues.push({ id: object.id, issue: 'missing_parent' });
  }
  return { success: true, operation: 'fsck', checked: objects.length, healthy: issues.length === 0, issues };
}

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

async function blame(req) {
  const db = await getDatabase(); const state = await collectState(db, req, req.body?.agentId);
  if (!state) return { success: false, error: 'Agent not found.' };
  const section = String(req.body?.section || 'decisions'); const rows = Array.isArray(state[section]) ? state[section] : [];
  return { success: true, operation: 'blame', agentId: state.agent.id, section, entries: rows.map((item) => ({ id: item.id || item.event_id || item.action_input, sourceAgentId: item.created_by || item.agent_id || state.agent.id, createdAt: item.created_at })) };
}

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

async function rebaseInteractive(req) {
    const db = await getDatabase();
    const ids = Array.isArray(req.body?.objectIds) ? req.body.objectIds : [];
    if (!ids.length) return { success: false, error: 'objectIds are required.' };
    const objects = [];
    for (const id of ids) { const object = await getObject(db, req, id); if (!object) return { success: false, error: `Object '${id}' not found.` }; objects.push(object); }
    const actions = req.body?.actions || ids.map(() => ({ action: 'pick' }));
    const conflicts = actions.map((item, index) => item.action === 'edit' && !item.state ? { index, reason: 'edit requires state' } : null).filter(Boolean);
    if (conflicts.length) return { success: false, operation: 'rebase-interactive', conflict: true, conflicts, plan: actions };
    let merged = {};
    for (const [index, item] of actions.entries()) {
      if (item.action === 'drop') continue;
      const next = item.action === 'edit' ? item.state : JSON.parse(objects[index].state_json);
      merged = { ...merged, ...next, agent: { ...(merged.agent || {}), ...(next.agent || {}) } };
    }
    const agentId = req.body?.targetAgentId || objects[0].agent_id;
    const commit = await storeObject(db, { agentId, workspaceId: merged.agent?.workspace_id, kind: 'commit', refName: req.body?.refName || 'main', state: merged, createdBy: req.user?.username || 'agent-git', metadata: { interactiveRebase: ids, actions } });
    return { success: true, operation: 'rebase-interactive', ...commit, appliedActions: actions };
}

async function mergeBase(req) {
  const db = await getDatabase(); const left = await collectState(db, req, req.body?.leftAgentId); const right = await collectState(db, req, req.body?.rightAgentId);
  if (!left || !right) return { success: false, error: 'Both agents must exist.' };
  const objects = await db.all(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND ${scopeSql(req, 'w').clause} ORDER BY o.created_at ASC`, left.agent.id, ...scopeSql(req, 'w').params);
  const rightObjects = await db.all(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND ${scopeSql(req, 'w').clause} ORDER BY o.created_at ASC`, right.agent.id, ...scopeSql(req, 'w').params);
  const rightHashes = new Set(rightObjects.map((object) => object.state_hash)); const base = objects.reverse().find((object) => rightHashes.has(object.state_hash));
  return { success: true, operation: 'diff-merge-base', mergeBaseObjectId: base?.id || null, leftHash: hashState(left), rightHash: hashState(right), changedSections: changedSections(left, right) };
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
  const db = await getDatabase();
  const agentId = req.body?.agentId;
  const field = String(req.body?.field || '').trim();
  const expected = req.body?.expectedValue;
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND o.object_kind IN ('commit', 'stash', 'remote') AND ${scope.clause} ORDER BY o.created_at, o.id`, agentId, ...scope.params);
  if (objects.length < 2) return { success: false, error: 'At least two agent Git objects are required.' };
  const value = (object) => String(field).split('.').reduce((current, key) => current == null ? undefined : current[key], JSON.parse(object.state_json));
  const matches = (object) => JSON.stringify(value(object)) === JSON.stringify(expected);
  let low = 1; let high = objects.length - 1; let culprit = -1; let iterations = 0;
  while (low <= high) { const middle = Math.floor((low + high) / 2); iterations += 1; if (matches(objects[middle])) low = middle + 1; else { culprit = middle; high = middle - 1; } }
  return { success: true, operation: 'bisect', agentId, field, expectedValue: expected, anomalyFound: culprit >= 0, culpritObjectId: culprit >= 0 ? objects[culprit].id : null, iterations, complexity: `O(log2(${objects.length}))` };
}

module.exports = {
  hashState, signObject, collectState, changedSections, createCommit, push, fetch, receiveRemote, pull, stash, tag, cherryPick, diff, merge, replay, bisect, log, show, fsck, gc, blame, note, hook, mergeBase, archive, revert, rebase, rebaseInteractive, applyState, getObject,
  enforceHooks, applyState, updateRef, scopeSql, loadAgent, signObject, verifyObjectSignature, json
};
