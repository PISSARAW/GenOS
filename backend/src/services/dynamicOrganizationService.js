const crypto = require('crypto');

const ORGANIZATIONS = Object.freeze({
  specialist_expert_committee: { topology: 'hub_and_spoke', exchange: 'indirect', visibility: 'attributed', routing: 'orchestrator' },
  blind_adversarial_review: { topology: 'isolated_critics', exchange: 'indirect', visibility: 'anonymous', routing: 'broadcast' },
  red_blue_coevolution: { topology: 'adversarial_triangle', exchange: 'active', visibility: 'attributed', routing: 'broadcast' },
  brier_weighted_consensus: { topology: 'weighted_quorum', exchange: 'active', visibility: 'attributed', routing: 'broadcast' },
  quorum_with_abstention: { topology: 'quorum', exchange: 'active', visibility: 'attributed', routing: 'broadcast' },
  stigmergy: { topology: 'shared_environment', exchange: 'implicit', visibility: 'attributed', routing: 'shared_trail' },
  flocking_boids: { topology: 'dynamic_neighbors', exchange: 'active', visibility: 'attributed', routing: 'broadcast' },
  fish_school_search: { topology: 'weighted_barycenter', exchange: 'implicit', visibility: 'attributed', routing: 'broadcast' },
  slime_mould_network: { topology: 'adaptive_mesh', exchange: 'implicit', visibility: 'attributed', routing: 'capability' },
  grey_wolf_optimizer: { topology: 'alpha_beta_delta', exchange: 'indirect', visibility: 'attributed', routing: 'ranked' },
  mycelial_routing: { topology: 'capability_mesh', exchange: 'active', visibility: 'attributed', routing: 'capability' },
  dynamic_polyethism: { topology: 'role_gradient', exchange: 'active', visibility: 'attributed', routing: 'capability' },
  energy_huddle: { topology: 'resource_huddle', exchange: 'active', visibility: 'attributed', routing: 'broadcast' },
  network_silence: { topology: 'isolated', exchange: 'buffered', visibility: 'attributed', routing: 'critical_only' },
  strategy_arena: { topology: 'isolated_competitors', exchange: 'indirect', visibility: 'sealed', routing: 'orchestrator' },
  hierarchical_merge: { topology: 'hierarchy', exchange: 'indirect', visibility: 'attributed', routing: 'orchestrator' },
  competitive_arena: { topology: 'isolated_competitors', exchange: 'indirect', visibility: 'sealed', routing: 'orchestrator' },
  isolated_recovery: { topology: 'isolated', exchange: 'indirect', visibility: 'sealed', routing: 'orchestrator' },
  memory_compilation: { topology: 'shared_memory', exchange: 'implicit', visibility: 'attributed', routing: 'shared_trail' }
});

const MESSAGE_KINDS = new Set([
  'evidence', 'question', 'answer', 'challenge', 'proposal', 'vote', 'trace',
  'budget', 'critical', 'success', 'handoff'
]);
const tableInitializations = new WeakMap();

function organizationProfile(name) {
  return ORGANIZATIONS[String(name || '').trim()] || null;
}

function organizationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function ensureTables(db) {
  if (tableInitializations.has(db)) return tableInitializations.get(db);
  const initialization = db.exec(`
    CREATE TABLE IF NOT EXISTS agent_organization_state (
      orchestrator_id TEXT PRIMARY KEY,
      organization TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      policy_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT,
      changed_by TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS agent_organization_transitions (
      id TEXT PRIMARY KEY,
      orchestrator_id TEXT NOT NULL,
      from_organization TEXT,
      to_organization TEXT NOT NULL,
      version INTEGER NOT NULL,
      reason TEXT,
      changed_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS agent_organization_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orchestrator_id TEXT NOT NULL,
      organization TEXT NOT NULL,
      organization_version INTEGER NOT NULL,
      sender_agent_id TEXT NOT NULL,
      recipient_agent_id TEXT,
      channel TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      delivery TEXT NOT NULL DEFAULT 'delivered',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_agent_org_messages_inbox
      ON agent_organization_messages(orchestrator_id, id);
  `).catch((error) => {
    tableInitializations.delete(db);
    throw error;
  });
  tableInitializations.set(db, initialization);
  return initialization;
}

async function assertOrchestrator(db, orchestratorId) {
  const agent = await db.get("SELECT id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", orchestratorId);
  if (!agent) throw organizationError('ORCHESTRATOR_NOT_FOUND', `Orchestrator '${orchestratorId}' was not found.`);
}

async function assertMember(db, orchestratorId, agentId) {
  if (agentId === orchestratorId) return { id: agentId, role: 'orchestrator', execution_mode: 'orchestrator' };
  const agent = await db.get(
    "SELECT id, role, execution_mode FROM agents WHERE id = ? AND parent_agent_id = ? AND execution_mode = 'worker'",
    agentId, orchestratorId
  );
  if (!agent) throw organizationError('ORGANIZATION_MEMBER_REQUIRED', `Agent '${agentId}' does not belong to orchestrator '${orchestratorId}'.`);
  return agent;
}

async function getState(db, orchestratorId) {
  await ensureTables(db);
  const row = await db.get(
    'SELECT orchestrator_id as orchestratorId, organization, version, policy_json as policyJson, reason, changed_by as changedBy, updated_at as updatedAt FROM agent_organization_state WHERE orchestrator_id = ?',
    orchestratorId
  );
  if (!row) return null;
  return { ...row, policy: JSON.parse(row.policyJson || '{}') };
}

async function getStateForMember(db, orchestratorId, requesterAgentId) {
  await assertMember(db, orchestratorId, requesterAgentId);
  return getState(db, orchestratorId);
}

async function changeOrganization(db, { orchestratorId, organization, reason, changedBy } = {}) {
  await ensureTables(db);
  await assertOrchestrator(db, orchestratorId);
  const profile = organizationProfile(organization);
  if (!profile) throw organizationError('UNKNOWN_ORGANIZATION', `Unknown GenOS organization '${organization}'.`);
  const current = await getState(db, orchestratorId);
  if (current?.organization === organization) {
    return {
      orchestratorId, previous: current.organization, organization, version: current.version,
      policy: current.policy, reason: String(reason || current.reason || 'Organization already active.'), changed: false
    };
  }
  const version = Number(current?.version || 0) + 1;
  const actor = changedBy || orchestratorId;
  if (actor !== orchestratorId) throw organizationError('ORCHESTRATOR_AUTHORITY_REQUIRED', 'Only the owning orchestrator may change the organization.');
  await db.run(
    `INSERT INTO agent_organization_state(orchestrator_id, organization, version, policy_json, reason, changed_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(orchestrator_id) DO UPDATE SET organization = excluded.organization, version = excluded.version,
       policy_json = excluded.policy_json, reason = excluded.reason, changed_by = excluded.changed_by, updated_at = CURRENT_TIMESTAMP`,
    orchestratorId, organization, version, JSON.stringify(profile), String(reason || 'Runtime need changed.'), actor
  );
  await db.run(
    `INSERT INTO agent_organization_transitions(id, orchestrator_id, from_organization, to_organization, version, reason, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `org-transition-${crypto.randomUUID()}`, orchestratorId, current?.organization || null, organization, version,
    String(reason || 'Runtime need changed.'), actor
  );
  if (organization !== 'network_silence') {
    await db.run(
      "UPDATE agent_organization_messages SET delivery = 'delivered' WHERE orchestrator_id = ? AND delivery = 'buffered'",
      orchestratorId
    );
  }
  return { orchestratorId, previous: current?.organization || null, organization, version, policy: profile, reason: String(reason || 'Runtime need changed.'), changed: true };
}

function routeMessage({ state, sender, recipientAgentId, kind }) {
  const policy = state.policy;
  if (policy.routing === 'critical_only' && !['critical', 'success'].includes(kind)) {
    return { recipientAgentId: null, channel: 'local_buffer', delivery: 'buffered' };
  }
  if (policy.routing === 'orchestrator') {
    return { recipientAgentId: state.orchestratorId, channel: 'orchestrator_handoff', delivery: 'delivered' };
  }
  if (policy.routing === 'shared_trail') {
    return { recipientAgentId: null, channel: 'stigmergic_trail', delivery: 'delivered' };
  }
  if (policy.routing === 'capability') {
    return { recipientAgentId: recipientAgentId || null, channel: 'capability_mesh', delivery: 'delivered' };
  }
  if (policy.routing === 'ranked') {
    return { recipientAgentId: recipientAgentId || state.orchestratorId, channel: 'ranked_handoff', delivery: 'delivered' };
  }
  return { recipientAgentId: recipientAgentId || null, channel: policy.topology, delivery: 'delivered' };
}

async function publish(db, { orchestratorId, senderAgentId, recipientAgentId, kind = 'evidence', content, payload = {} } = {}) {
  await ensureTables(db);
  const state = await getState(db, orchestratorId);
  if (!state) throw organizationError('ORGANIZATION_NOT_INITIALIZED', `Orchestrator '${orchestratorId}' has no active organization.`);
  const sender = await assertMember(db, orchestratorId, senderAgentId);
  if (recipientAgentId) await assertMember(db, orchestratorId, recipientAgentId);
  const normalizedKind = String(kind).trim().toLowerCase();
  if (!MESSAGE_KINDS.has(normalizedKind)) throw organizationError('INVALID_MESSAGE_KIND', `Unsupported organization message kind '${kind}'.`);
  const text = String(content || '').trim();
  if (!text) throw organizationError('MESSAGE_REQUIRED', 'Organization messages require content.');
  if (text.length > 12000) throw organizationError('MESSAGE_TOO_LARGE', 'Organization messages are limited to 12000 characters.');
  const route = routeMessage({ state, sender, recipientAgentId, kind: normalizedKind });
  const result = await db.run(
    `INSERT INTO agent_organization_messages(orchestrator_id, organization, organization_version, sender_agent_id,
      recipient_agent_id, channel, kind, content, payload_json, delivery)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orchestratorId, state.organization, state.version, senderAgentId, route.recipientAgentId,
    route.channel, normalizedKind, text, JSON.stringify(payload || {}), route.delivery
  );
  return { id: result.lastID, organization: state.organization, version: state.version, ...route, kind: normalizedKind };
}

async function inbox(db, { orchestratorId, requesterAgentId, afterId = 0, limit = 20 } = {}) {
  await ensureTables(db);
  const state = await getState(db, orchestratorId);
  if (!state) throw organizationError('ORGANIZATION_NOT_INITIALIZED', `Orchestrator '${orchestratorId}' has no active organization.`);
  await assertMember(db, orchestratorId, requesterAgentId);
  const orchestrator = requesterAgentId === orchestratorId;
  const rows = await db.all(
    `SELECT id, organization, organization_version as organizationVersion, sender_agent_id as senderAgentId,
            recipient_agent_id as recipientAgentId, channel, kind, content, payload_json as payloadJson,
            delivery, created_at as createdAt
     FROM agent_organization_messages
     WHERE orchestrator_id = ? AND id > ? AND sender_agent_id <> ?
       AND (? = 1 OR (delivery = 'delivered' AND (recipient_agent_id IS NULL OR recipient_agent_id = ?)))
     ORDER BY id LIMIT ?`,
    orchestratorId, Math.max(0, Number(afterId || 0)), requesterAgentId, orchestrator ? 1 : 0,
    requesterAgentId, Math.min(50, Math.max(1, Number(limit || 20)))
  );
  return {
    state,
    messages: rows.map((row) => ({
      ...row,
      senderAgentId: organizationProfile(row.organization)?.visibility === 'anonymous' ? 'anonymous_worker' : row.senderAgentId,
      payload: JSON.parse(row.payloadJson || '{}')
    }))
  };
}

module.exports = {
  ORGANIZATIONS,
  MESSAGE_KINDS,
  organizationProfile,
  ensureTables,
  getState,
  getStateForMember,
  changeOrganization,
  routeMessage,
  publish,
  inbox
};
