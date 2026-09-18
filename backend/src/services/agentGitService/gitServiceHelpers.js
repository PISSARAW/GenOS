const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { validateProviderEndpointAsync } = require('../providerEndpointPolicy');
const { enforceHooks } = require('./hooks');
const { applyState } = require('./state');
const { updateRef } = require('./refs');

async function assertRemoteGitUrl(rawUrl) {
  if (process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES === '1') return;
  await validateProviderEndpointAsync(String(rawUrl), { localOnly: false });
}

function scopeSql(req, alias = 'w') {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
}

function hashState(state) { return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'); }

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

function signingPayload(stateHash, metadata) { return Buffer.from(`${stateHash}:${JSON.stringify(metadata || {})}`); }
function signingAlgorithm() { return process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY ? 'ed25519' : 'hmac-sha256'; }

function signObject(stateHash, metadata) {
  const payload = signingPayload(stateHash, metadata);
  if (signingAlgorithm() === 'ed25519') return crypto.sign(null, payload, process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY).toString('base64');
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex');
}

function signatureEncoding(isEd25519) { return isEd25519 ? 'base64' : 'utf8'; }

function verifyObjectSignature(object) {
  if (!object.signature) return false;
  const isEd25519 = signingAlgorithm() === 'ed25519';
  const metadata = json(object.metadata_json, {});
  const encoding = signatureEncoding(isEd25519);
  const expected = Buffer.from(signObject(object.state_hash, metadata), encoding);
  const actual = Buffer.from(object.signature, encoding);
  if (actual.length !== expected.length) return false;
  if (isEd25519) return crypto.verify(null, signingPayload(object.state_hash, metadata), process.env.GENOS_AGENT_GIT_SIGNING_PUBLIC_KEY || process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY, actual);
  return crypto.timingSafeEqual(actual, expected);
}

function json(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function bodyValue(req, key) {
  if (!req.body) return undefined;
  return req.body[key];
}

function bodyOrDefault(req, key, fallback) {
  const value = bodyValue(req, key);
  if (value) return value;
  return fallback;
}

function trimOrDefault(value, fallback) { return String(value || fallback).trim(); }

function username(req, fallback) {
  const user = req.user;
  if (user && user.username) return user.username;
  return fallback;
}

function sectionState(state, section) {
  if (!state) return undefined;
  return state[section];
}

function changedSections(left, right) {
  const sections = ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions', 'events', 'children'];
  return sections.filter((section) => JSON.stringify(sectionState(left, section)) !== JSON.stringify(sectionState(right, section)));
}

function remoteEndpoint(url, suffix) { return `${String(url).replace(/\/$/, '')}${suffix}`; }

function remoteHeaders(req) {
  const token = bodyValue(req, 'remoteToken');
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

function assertRemoteOk(response, operation) {
  if (!response.ok) throw new Error(`Remote ${operation} failed with HTTP ${response.status}.`);
}

async function loadAgent(db, req, agentId) {
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
  return { schema: 'genos.agent-git-state/v1', agent, decisions, memories, runs, plasmids, permissions, events, children, capturedAt: new Date().toISOString() };
}

async function storeObject({ db, agentId, workspaceId, kind, refName, remoteName, state, createdBy, metadata = {}, locked = false }) {
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
  const result = await storeObject(db, { agentId: options.agentId, workspaceId: state.agent.workspace_id, kind: options.kind || 'commit', refName: options.refName || 'main', remoteName: options.remoteName, state, createdBy: username(req, 'agent-git'), metadata: options.metadata || {} });
  await updateRef({ db, req, agentId: options.agentId, refName: options.refName || 'main', objectId: result.id, options: { expectedVersion: options.expectedVersion, leaseToken: options.leaseToken, action: options.kind || 'commit' } });
  return result;
}

function guardFastForward(req, currentRef) {
  const force = bodyValue(req, 'force');
  const expected = bodyValue(req, 'expectedVersion');
  const current = (currentRef ? currentRef.version : 0) || 0;
  if (force !== true && expected != null && Number(expected) !== Number(current)) {
    throw Object.assign(new Error('Push rejected: remote tracking ref diverged.'), { code: 'AGENT_PUSH_NON_FAST_FORWARD' });
  }
}

async function deliverRemoteObject(req, agentId, commit) {
  const url = bodyValue(req, 'remoteUrl');
  if (!url) return;
  await assertRemoteGitUrl(url);
  const state = await collectState(await getDatabase(), req, agentId);
  const response = await globalThis.fetch(remoteEndpoint(url, '/api/lineage/agents/git/remote/push'), {
    method: 'POST',
    headers: remoteHeaders(req),
    body: JSON.stringify({ ...req.body, objectId: commit.id, object: commit, state })
  });
  assertRemoteOk(response, 'push');
}

async function push(req) {
  const agentId = trimOrDefault(bodyValue(req, 'agentId'), '');
  const remoteName = trimOrDefault(bodyValue(req, 'remoteName'), 'default');
  const db = await getDatabase();
  await enforceHooks({ db, agentId, hookName: 'pre-push', context: await collectState(db, req, agentId) });
  const currentRef = await db.get('SELECT version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, bodyValue(req, 'refName') || 'main');
  guardFastForward(req, currentRef);
  const commit = await createCommit(req, {
    agentId,
    kind: 'remote',
    refName: bodyValue(req, 'refName') || 'main',
    remoteName,
    metadata: { pushed: true, remoteUrl: bodyValue(req, 'remoteUrl') || null }
  });
  await deliverRemoteObject(req, agentId, commit);
  return { success: true, operation: 'push', remoteName, force: bodyValue(req, 'force') === true, tracking: { ahead: 1, behind: 0 }, ...commit };
}

async function fetch(req) {
  const db = await getDatabase();
  const remoteName = trimOrDefault(bodyValue(req, 'remoteName'), 'default');
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.id, o.agent_id, o.state_hash, o.ref_name, o.created_at FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.object_kind = 'remote' AND o.remote_name = ? AND ${scope.clause} ORDER BY o.created_at DESC`, remoteName, ...scope.params);
  const url = bodyValue(req, 'remoteUrl');
  if (!url) return { success: true, operation: 'fetch', remoteName, objects };
  await assertRemoteGitUrl(url);
  const response = await globalThis.fetch(remoteEndpoint(url, '/api/lineage/agents/git/remote/fetch'), { method: 'POST', headers: remoteHeaders(req), body: JSON.stringify({ ...req.body, remoteName }) });
  assertRemoteOk(response, 'fetch');
  return { success: true, operation: 'fetch', remoteName, remote: await response.json(), objects };
}

async function receiveRemote(req) {
  const incoming = bodyValue(req, 'object');
  if (!incoming || !incoming.id || !incoming.stateHash) return { success: false, error: 'Signed remote object is required.' };
  const db = await getDatabase();
  const state = bodyValue(req, 'state') || null;
  if (!state) return { success: false, error: 'Remote state payload is required.' };
  const stored = await storeObject(db, {
    agentId: incoming.agentId,
    workspaceId: incoming.workspaceId,
    kind: 'remote',
    refName: incoming.refName,
    remoteName: bodyValue(req, 'remoteName') || 'default',
    state,
    createdBy: req.user ? req.user.username : 'remote',
    metadata: { receivedFrom: req.ip || 'remote', sourceObjectId: incoming.id },
    locked: true
  });
  return { success: true, operation: 'remote-receive', ...stored };
}

function hasCandidateId(candidates, id) {
  return (candidates || []).some((candidate) => candidate.id === id);
}

function invertedState(current, target) {
  return {
    ...current,
    agent: current.agent,
    decisions: (current.decisions || []).filter((item) => !hasCandidateId(target.decisions, item.id)),
    memories: (current.memories || []).filter((item) => !hasCandidateId(target.memories, item.id))
  };
}

async function revert(req) {
  const db = await getDatabase();
  const object = await getObject(db, req, bodyValue(req, 'objectId'));
  if (!object) return { success: false, error: 'Agent object not found.' };
  const targetAgentId = bodyOrDefault(req, 'targetAgentId') || object.agent_id;
  const current = await collectState(db, req, targetAgentId);
  const target = JSON.parse(object.state_json);
  const inverse = invertedState(current, target);
  const result = await applyState(db, req, targetAgentId, inverse, ['decisions', 'memories']);
  const commit = await storeObject(db, {
    agentId: result.targetAgentId,
    workspaceId: current.agent.workspace_id,
    kind: 'commit',
    refName: bodyOrDefault(req, 'refName') || 'main',
    state: inverse,
    createdBy: username(req, 'agent-git'),
    metadata: { revertOf: object.id, inverse: true }
  });
  return { success: true, operation: 'revert', revertedObjectId: object.id, ...result, ...commit };
}

function rebaseConflicts(oursState, ontoState) {
  return changedSections(oursState, ontoState)
    .filter((section) => section !== 'capturedAt')
    .map((section) => ({ section, ours: oursState[section], onto: ontoState[section] }));
}

function rebaseResolutionValid(req) {
  const resolution = bodyValue(req, 'resolution');
  return resolution === 'ours' || resolution === 'onto';
}

function rebaseTarget(req, ours) { return bodyOrDefault(req, 'targetAgentId') || ours.agent_id; }
function rebaseRefName(req, ours) { return bodyOrDefault(req, 'refName') || ours.ref_name || 'main'; }

async function rebase(req) {
  const db = await getDatabase();
  const ours = await getObject(db, req, bodyValue(req, 'oursObjectId'));
  const onto = await getObject(db, req, bodyValue(req, 'ontoObjectId'));
  if (!ours || !onto) return { success: false, error: 'Both rebase objects are required.' };
  const oursState = JSON.parse(ours.state_json);
  const ontoState = JSON.parse(onto.state_json);
  const conflicts = rebaseConflicts(oursState, ontoState);
  const resolutionValid = rebaseResolutionValid(req);
  if (conflicts.length && !resolutionValid) return { success: false, operation: 'rebase', conflict: true, conflicts, resolutionRequired: true };
  const base = bodyValue(req, 'resolution') === 'onto' ? ontoState : oursState;
  const sections = bodyValue(req, 'sections') || ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions'];
  const result = await applyState(db, req, rebaseTarget(req, ours), base, sections);
  const commit = await storeObject(db, {
    agentId: result.targetAgentId,
    workspaceId: base.agent.workspace_id,
    kind: 'commit',
    refName: rebaseRefName(req, ours),
    state: base,
    createdBy: username(req, 'agent-git'),
    metadata: { rebaseFrom: ours.id, rebaseOnto: onto.id, conflictsResolved: conflicts.length }
  });
  return { success: true, operation: 'rebase', ...result, ...commit, conflictsResolved: conflicts.length };
}

async function loadPlanObjects(db, req, ids) {
  const objects = [];
  for (const id of ids) {
    const object = await getObject(db, req, id);
    if (!object) return { missingId: id };
    objects.push(object);
  }
  return { objects };
}

function planActions(req, ids) {
  return bodyValue(req, 'actions') || ids.map(() => ({ action: 'pick' }));
}

function editConflicts(actions) {
  const conflicts = [];
  actions.forEach((item, index) => {
    if (item.action === 'edit' && !item.state) conflicts.push({ index, reason: 'edit requires state' });
  });
  return conflicts;
}

function applyPlanActions(actions, objects) {
  let merged = {};
  actions.forEach((item, index) => {
    if (item.action === 'drop') return;
    const next = item.action === 'edit' ? item.state : JSON.parse(objects[index].state_json);
    merged = { ...merged, ...next, agent: { ...(merged.agent || {}), ...(next.agent || {}) } };
  });
  return merged;
}

async function rebaseInteractive(req) {
  const db = await getDatabase();
  const ids = Array.isArray(bodyValue(req, 'objectIds')) ? bodyValue(req, 'objectIds') : [];
  if (!ids.length) return { success: false, error: 'objectIds are required.' };
  const loaded = await loadPlanObjects(db, req, ids);
  if (!loaded.objects) return { success: false, error: `Object '${loaded.missingId}' not found.` };
  const actions = planActions(req, ids);
  const conflicts = editConflicts(actions);
  if (conflicts.length) return { success: false, operation: 'rebase-interactive', conflict: true, conflicts, plan: actions };
  const merged = applyPlanActions(actions, loaded.objects);
  const commit = await storeObject(db, {
    agentId: bodyOrDefault(req, 'targetAgentId') || loaded.objects[0].agent_id,
    workspaceId: merged.agent ? merged.agent.workspace_id : undefined,
    kind: 'commit',
    refName: bodyOrDefault(req, 'refName') || 'main',
    state: merged,
    createdBy: username(req, 'agent-git'),
    metadata: { interactiveRebase: ids, actions }
  });
  return { success: true, operation: 'rebase-interactive', ...commit, appliedActions: actions };
}

function bisectValueAt(field, object) {
  return String(field).split('.').reduce((current, key) => (current == null ? undefined : current[key]), JSON.parse(object.state_json));
}

function bisectMatches(object, field, expected) {
  return JSON.stringify(bisectValueAt(field, object)) === JSON.stringify(expected);
}

function bisectSearch(objects, field, expected) {
  let low = 1;
  let high = objects.length - 1;
  let culprit = -1;
  let iterations = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    iterations += 1;
    if (bisectMatches(objects[middle], field, expected)) low = middle + 1; else { culprit = middle; high = middle - 1; }
  }
  return { index: culprit, iterations };
}

async function bisect(req) {
  const db = await getDatabase();
  const agentId = bodyValue(req, 'agentId');
  const field = trimOrDefault(bodyValue(req, 'field'), '');
  const expected = bodyValue(req, 'expectedValue');
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.agent_id = ? AND o.object_kind IN ('commit', 'stash', 'remote') AND ${scope.clause} ORDER BY o.created_at, o.id`, agentId, ...scope.params);
  if (objects.length < 2) return { success: false, error: 'At least two agent Git objects are required.' };
  const result = bisectSearch(objects, field, expected);
  return {
    success: true,
    operation: 'bisect',
    agentId,
    field,
    expectedValue: expected,
    anomalyFound: result.index >= 0,
    culpritObjectId: result.index >= 0 ? objects[result.index].id : null,
    iterations: result.iterations,
    complexity: `O(log2(${objects.length}))`
  };
}

module.exports = {
  assertRemoteGitUrl, scopeSql, json, hashState, signObject, verifyObjectSignature, changedSections,
  bodyValue, bodyOrDefault, trimOrDefault, username, loadAgent, collectState, storeObject, getObject,
  createCommit, push, fetch, receiveRemote, revert, rebase, rebaseInteractive, bisect
};
