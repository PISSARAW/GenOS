const crypto = require('crypto');
const { getDatabase } = require('../db');

function hashState(state) {
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

function json(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function scopeSql(req, alias = 'w') {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
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

async function storeObject(db, { agentId, workspaceId, kind, refName, remoteName, state, createdBy, metadata = {} }) {
  const id = `agent-git-${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const stateJson = JSON.stringify(state);
  await db.run(
    `INSERT INTO agent_git_objects (id, agent_id, workspace_id, object_kind, ref_name, remote_name, state_hash, state_json, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, agentId, workspaceId, kind, refName || null, remoteName || null, hashState(state), stateJson, JSON.stringify(metadata), createdBy || 'agent-git'
  );
  return { id, agentId, workspaceId, kind, refName: refName || null, remoteName: remoteName || null, stateHash: hashState(state) };
}

async function getObject(db, req, objectId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

async function applyState(db, req, targetAgentId, state, sections) {
  const target = await loadAgent(db, req, targetAgentId);
  if (!target) throw Object.assign(new Error('Target agent is not available in the current tenant.'), { code: 'AGENT_NOT_FOUND' });
  const selected = new Set(sections || ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']);
  if (selected.has('agent')) {
    const a = state.agent;
    await db.run(`UPDATE agents SET name = ?, name_meaning = ?, role = ?, model_tier = ?, language = ?, isolation_mode = ?, status = ?, current_task = ?, dissonance_level = ?, eureka_count = ?, cognitive_budget = ?, cognitive_baseline_budget = ?, cognitive_max_dissonance = ?, is_apoptotic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, a.name, a.name_meaning, a.role, a.model_tier, a.language, a.isolation_mode, a.status, a.current_task, a.dissonance_level || 0, a.eureka_count || 0, a.cognitive_budget ?? 0, a.cognitive_baseline_budget ?? 0, a.cognitive_max_dissonance ?? 50, a.is_apoptotic || 0, targetAgentId);
  }
  if (selected.has('decisions')) {
    for (const item of state.decisions || []) {
      const id = `agent-git-decision-${targetAgentId}-${item.id}`;
      await db.run(`INSERT OR REPLACE INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, item.title, item.content, item.cart_nodes_json || '[]', targetAgentId, item.category, item.synaptic_weight || 1, req.tenant?.organizationId || item.organization_id || null, req.tenant?.projectId || item.project_id || null);
    }
  }
  if (selected.has('memories')) {
    for (const memory of state.memories || []) {
      const id = `agent-git-memory-${targetAgentId}-${memory.id}`;
      await db.run(`INSERT OR IGNORE INTO episodic_memories (id, agent_id, session_id, task_id, turn_number, action_type, context_state, action_input, observation_output, reward_score, is_consolidated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, targetAgentId, memory.session_id, memory.task_id, memory.turn_number || 0, memory.action_type, memory.context_state || '{}', memory.action_input, memory.observation_output, memory.reward_score || 0, memory.is_consolidated || 0);
    }
  }
  if (selected.has('runs')) {
    for (const run of state.runs || []) {
      const id = `agent-git-run-${targetAgentId}-${run.id}`;
      await db.run(`INSERT OR IGNORE INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, budget_json, metrics_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, targetAgentId, run.contract_id, run.contract_version, run.status, run.budget_json || '{}', run.metrics_json || '{}', run.created_at);
    }
  }
  if (selected.has('plasmids')) {
    for (const plasmid of state.plasmids || []) {
      await db.run(`INSERT OR REPLACE INTO plasmid_bindings (plasmid_id, owner_agent_id, source_agent_id, organization_id, project_id, status) VALUES (?, ?, ?, ?, ?, ?)`, plasmid.plasmid_id, targetAgentId, plasmid.source_agent_id, req.tenant?.organizationId || plasmid.organization_id || null, req.tenant?.projectId || plasmid.project_id || null, plasmid.status || 'active');
    }
  }
  if (selected.has('permissions')) {
    for (const permission of state.permissions || []) {
      await db.run(`INSERT OR REPLACE INTO agent_permissions (agent_id, permissions_json, denied_tools_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?)`, targetAgentId, permission.permissions_json || '[]', permission.denied_tools_json || '[]', req.tenant?.organizationId || permission.organization_id || null, req.tenant?.projectId || permission.project_id || null);
    }
  }
  return { targetAgentId, sections: [...selected] };
}

async function createCommit(req, options = {}) {
  const db = await getDatabase();
  const state = await collectState(db, req, options.agentId);
  if (!state) throw Object.assign(new Error('Agent is not available in the current tenant.'), { code: 'AGENT_NOT_FOUND' });
  return storeObject(db, { agentId: options.agentId, workspaceId: state.agent.workspace_id, kind: options.kind || 'commit', refName: options.refName || 'main', remoteName: options.remoteName, state, createdBy: req.user?.username || 'agent-git', metadata: options.metadata || {} });
}

async function push(req) {
  const agentId = String(req.body?.agentId || '').trim();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const commit = await createCommit(req, { agentId, kind: 'remote', refName: req.body?.refName || 'main', remoteName, metadata: { pushed: true } });
  return { success: true, operation: 'push', remoteName, ...commit };
}

async function fetch(req) {
  const db = await getDatabase();
  const remoteName = String(req.body?.remoteName || 'default').trim();
  const scope = scopeSql(req, 'w');
  const objects = await db.all(`SELECT o.id, o.agent_id, o.state_hash, o.ref_name, o.created_at FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.object_kind = 'remote' AND o.remote_name = ? AND ${scope.clause} ORDER BY o.created_at DESC`, remoteName, ...scope.params);
  return { success: true, operation: 'fetch', remoteName, objects };
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
async function tag(req) { return { success: true, operation: 'tag', ...(await createCommit(req, { agentId: req.body?.agentId, kind: 'tag', refName: req.body?.tagName, metadata: { stable: true } })) }; }

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
  const merged = {
    ...left,
    agent: { ...left.agent, name: req.body?.name || `Merge of ${left.agent.name} + ${right.agent.name}`, role: req.body?.role || `${left.agent.role}+${right.agent.role}`, cognitive_budget: Math.min(Number(left.agent.cognitive_budget || 0), Number(right.agent.cognitive_budget || 0)), dissonance_level: Math.max(Number(left.agent.dissonance_level || 0), Number(right.agent.dissonance_level || 0)) },
    decisions: unique([...left.decisions, ...right.decisions], (item) => `${item.title}:${item.content}`),
    memories: unique([...left.memories, ...right.memories], (item) => `${item.action_input}:${item.observation_output}:${item.created_at}`),
    runs: unique([...left.runs, ...right.runs], (item) => item.id),
    plasmids: unique([...left.plasmids, ...right.plasmids], (item) => item.plasmid_id),
    permissions: unique([...left.permissions, ...right.permissions], (item) => `${item.organization_id}:${item.project_id}`)
  };
  const result = await applyState(db, req, req.body?.targetAgentId || left.agent.id, merged, ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']);
  const object = await storeObject(db, { agentId: result.targetAgentId, workspaceId: merged.agent.workspace_id, kind: 'commit', refName: 'merge', state: merged, createdBy: req.user?.username || 'agent-git', metadata: { mergeParents: [left.agent.id, right.agent.id] } });
  return { success: true, operation: 'merge', ...result, ...object, parentAgentIds: [left.agent.id, right.agent.id] };
}

async function replay(req) {
  const db = await getDatabase();
  const object = await getObject(db, req, req.body?.objectId);
  if (!object) return { success: false, error: 'Agent object not found.' };
  const state = JSON.parse(object.state_json);
  const digest = hashState(state);
  return { success: true, operation: 'replay', objectId: object.id, replayVerified: digest === object.state_hash, state, stateHash: digest, applied: false };
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

module.exports = { hashState, collectState, changedSections, createCommit, push, fetch, pull, stash, tag, cherryPick, diff, merge, replay, bisect, applyState, getObject };
