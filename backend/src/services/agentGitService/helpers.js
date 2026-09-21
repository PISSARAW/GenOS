const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { validateProviderEndpointAsync } = require('../providerEndpointPolicy');

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
  const scope = scopeSql(require('..'), 'w');
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

module.exports = {
  scopeSql,
  hashState,
  signingSecret,
  signingPayload,
  signingAlgorithm,
  signObject,
  verifyObjectSignature,
  json,
  loadAgent,
  collectState,
  changedSections,
};