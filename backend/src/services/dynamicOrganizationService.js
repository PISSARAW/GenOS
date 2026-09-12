const crypto = require('crypto');
const { withTransaction } = require('../db');
const { formatSignalForTransport, unpackSignalPayload } = require('./biomimeticSignalingBus');

const ORGANIZATIONS = Object.freeze({
  specialist_expert_committee: { topology: 'hub_and_spoke', exchange: 'indirect', visibility: 'attributed', routing: 'orchestrator' },
  blind_adversarial_review: { topology: 'isolated_critics', exchange: 'indirect', visibility: 'anonymous', routing: 'broadcast' },
  red_blue_coevolution: { topology: 'adversarial_triangle', exchange: 'active', visibility: 'attributed', routing: 'adversarial_pair' },
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

const ROUTING_CHANNELS = Object.freeze({
  orchestrator: 'orchestrator_handoff',
  shared_trail: 'stigmergic_trail',
  capability: 'capability_mesh',
  ranked: 'ranked_handoff',
  adversarial_pair: 'adversarial_pair'
});

const tableInitializations = new WeakMap();

function organizationProfile(name) {
  return ORGANIZATIONS[String(name || '').trim()] || null;
}

function organizationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parsePayload(payloadJson) {
  try {
    const payload = JSON.parse(payloadJson || '{}');
    return payload && typeof payload === 'object' ? payload : {};
  } catch (_) {
    return {};
  }
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
      content TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      signal_type TEXT NOT NULL DEFAULT 'text',
      signal_blob BLOB,
      delivery TEXT NOT NULL DEFAULT 'delivered',
      organization_id TEXT,
      project_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_agent_org_messages_inbox
      ON agent_organization_messages(orchestrator_id, id);
  `).then(async () => {
    const columns = new Set((await db.all('PRAGMA table_info(agent_organization_messages)')).map((column) => column.name));
    if (!columns.has('organization_id')) await db.exec('ALTER TABLE agent_organization_messages ADD COLUMN organization_id TEXT');
    if (!columns.has('project_id')) await db.exec('ALTER TABLE agent_organization_messages ADD COLUMN project_id TEXT');
    if (!columns.has('signal_type')) await db.exec("ALTER TABLE agent_organization_messages ADD COLUMN signal_type TEXT NOT NULL DEFAULT 'text'");
    if (!columns.has('signal_blob')) await db.exec('ALTER TABLE agent_organization_messages ADD COLUMN signal_blob BLOB');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_agent_org_messages_scope ON agent_organization_messages(orchestrator_id, organization_id, project_id, id)');
  }).catch((error) => {
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
  if (!agentId || agentId === orchestratorId) return { id: agentId || orchestratorId, role: 'orchestrator', execution_mode: 'orchestrator' };
  let agent = await db.get(
    "SELECT id, role, execution_mode FROM agents WHERE id = ? AND parent_agent_id = ? AND execution_mode = 'worker'",
    agentId, orchestratorId
  );
  if (!agent) {
    const existing = await db.get('SELECT id, role, execution_mode FROM agents WHERE id = ?', agentId);
    if (existing) {
      await db.run('UPDATE agents SET parent_agent_id = ? WHERE id = ?', orchestratorId, agentId);
      agent = { ...existing, parent_agent_id: orchestratorId };
    } else {
      await db.run(
        "INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, parent_agent_id, current_task) VALUES (?, ?, 'worker', 'idle', 'worker', ?, 'organization member')",
        agentId, 'Member ' + agentId, orchestratorId
      );
      agent = { id: agentId, role: 'worker', execution_mode: 'worker', parent_agent_id: orchestratorId };
    }
  }
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

async function fetchAgentScope(db, agentId) {
  const row = await db.get(
    'SELECT w.organization_id as organizationId, w.project_id as projectId FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?',
    agentId
  );
  return {
    organizationId: row ? row.organizationId : null,
    projectId: row ? row.projectId : null
  };
}

async function recordOrganizationTransition(tx, ctx) {
  const { orchestratorId, organization, version, profile, reason, actor, prevOrg } = ctx;
  await tx.run(
    `INSERT INTO agent_organization_state(orchestrator_id, organization, version, policy_json, reason, changed_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(orchestrator_id) DO UPDATE SET organization = excluded.organization, version = excluded.version,
       policy_json = excluded.policy_json, reason = excluded.reason, changed_by = excluded.changed_by, updated_at = CURRENT_TIMESTAMP`,
    orchestratorId, organization, version, JSON.stringify(profile), reason, actor
  );
  await tx.run(
    `INSERT INTO agent_organization_transitions(id, orchestrator_id, from_organization, to_organization, version, reason, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `org-transition-${crypto.randomUUID()}`, orchestratorId, prevOrg, organization, version, reason, actor
  );
}

async function flushBufferedMessages(tx, ctx) {
  const { orchestratorId, organization, version, profile } = ctx;
  if (organization === 'network_silence') return;
  const flushRoute = routeMessage({ state: { policy: profile, orchestratorId }, sender: {}, recipientAgentId: null, kind: 'evidence' });
  await tx.run(
    "UPDATE agent_organization_messages SET delivery = ?, organization = ?, organization_version = ?, channel = ?, recipient_agent_id = ? WHERE orchestrator_id = ? AND delivery = 'buffered'",
    flushRoute.delivery, organization, version, flushRoute.channel, flushRoute.recipientAgentId, orchestratorId
  );
}

function buildUnchangedState(orchestratorId, current, reason) {
  const activeReason = String(reason || (current && current.reason) || 'Organization already active.');
  return {
    orchestratorId,
    previous: current.organization,
    organization: current.organization,
    version: current.version,
    policy: current.policy,
    reason: activeReason,
    changed: false
  };
}

async function changeOrganization(db, options = {}) {
  const { orchestratorId, organization, reason, changedBy } = options;
  await ensureTables(db);
  await assertOrchestrator(db, orchestratorId);
  const profile = organizationProfile(organization);
  if (!profile) throw organizationError('UNKNOWN_ORGANIZATION', `Unknown GenOS organization '${organization}'.`);
  const current = await getState(db, orchestratorId);
  const prevOrg = current ? current.organization : null;
  if (prevOrg === organization) {
    return buildUnchangedState(orchestratorId, current, reason);
  }
  const actor = changedBy || orchestratorId;
  if (actor !== orchestratorId) {
    throw organizationError('ORCHESTRATOR_AUTHORITY_REQUIRED', 'Only the owning orchestrator may change the organization.');
  }
  const version = Number(current ? current.version : 0) + 1;
  const finalReason = String(reason || 'Runtime need changed.');
  const ctx = { orchestratorId, organization, version, profile, reason: finalReason, actor, prevOrg };
  await withTransaction(db, async (tx) => {
    await recordOrganizationTransition(tx, ctx);
    await flushBufferedMessages(tx, ctx);
  });
  return { orchestratorId, previous: prevOrg, organization, version, policy: profile, reason: finalReason, changed: true };
}

function resolveWorkerTarget(routing, recipientAgentId, orchestratorId) {
  if (routing === 'orchestrator') return orchestratorId;
  if (routing === 'ranked') return recipientAgentId || orchestratorId;
  return null;
}

function resolveRoutingTarget(opts) {
  const { routing, isOrchestrator, recipientAgentId, orchestratorId } = opts;
  if (routing === 'shared_trail') return null;
  if (isOrchestrator) return recipientAgentId || null;
  const target = resolveWorkerTarget(routing, recipientAgentId, orchestratorId);
  return target || recipientAgentId || null;
}

function resolveRoutingChannel(routing, topology) {
  return ROUTING_CHANNELS[routing] || topology;
}

function isBufferedMessage(routing, kind, isOrchestrator) {
  if (isOrchestrator || routing !== 'critical_only') return false;
  return kind !== 'critical' && kind !== 'success';
}

function routeMessage({ state, sender, recipientAgentId, kind }) {
  const policy = state.policy;
  const isOrchestrator = sender.id === state.orchestratorId;
  if (isBufferedMessage(policy.routing, kind, isOrchestrator)) {
    return { recipientAgentId: recipientAgentId || null, channel: 'local_buffer', delivery: 'buffered' };
  }
  const targetOpts = { routing: policy.routing, isOrchestrator, recipientAgentId, orchestratorId: state.orchestratorId };
  return {
    recipientAgentId: resolveRoutingTarget(targetOpts),
    channel: resolveRoutingChannel(policy.routing, policy.topology),
    delivery: 'delivered'
  };
}

function resolveSignalPayload(content, signalType, signalData) {
  const hasSignal = signalData !== undefined && signalData !== null;
  const rawText = String(content || '').trim();
  if (!rawText && !hasSignal) {
    throw organizationError('MESSAGE_REQUIRED', 'Organization messages require content or a biomimetic signal.');
  }
  if (rawText.length > 12000) {
    throw organizationError('MESSAGE_TOO_LARGE', 'Organization messages are limited to 12000 characters.');
  }
  return formatSignalForTransport({ signalType, signalData, contentFallback: rawText });
}

function assertAdversarialRecipient(state, sender, recipientAgentId) {
  const isAdversarial = state.policy.routing === 'adversarial_pair';
  const isWorker = sender.id !== state.orchestratorId;
  if (isAdversarial && isWorker && !recipientAgentId) {
    throw organizationError('ADVERSARIAL_RECIPIENT_REQUIRED', 'Adversarial worker messages require an explicit counterpart recipient.');
  }
}

async function ensureActiveState(db, orchestratorId) {
  let state = await getState(db, orchestratorId);
  if (!state) {
    await changeOrganization(db, { orchestratorId, organization: 'specialist_expert_committee', reason: 'Auto-initialization' });
    state = await getState(db, orchestratorId);
  }
  return state;
}

async function publish(db, options = {}) {
  const { orchestratorId, senderAgentId, recipientAgentId, kind = 'evidence', content, payload = {}, signalType, signalData } = options;
  await ensureTables(db);
  const state = await ensureActiveState(db, orchestratorId);
  const sender = await assertMember(db, orchestratorId, senderAgentId);
  if (recipientAgentId) await assertMember(db, orchestratorId, recipientAgentId);
  const normalizedKind = String(kind).trim().toLowerCase();
  if (!MESSAGE_KINDS.has(normalizedKind)) throw organizationError('INVALID_MESSAGE_KIND', `Unsupported organization message kind '${kind}'.`);
  const signalInfo = resolveSignalPayload(content, signalType, signalData);
  assertAdversarialRecipient(state, sender, recipientAgentId);
  const route = routeMessage({ state, sender, recipientAgentId, kind: normalizedKind });
  const scope = await fetchAgentScope(db, orchestratorId);
  const result = await db.run(
    `INSERT INTO agent_organization_messages(orchestrator_id, organization, organization_version, sender_agent_id,
      recipient_agent_id, channel, kind, content, payload_json, signal_type, signal_blob, delivery, organization_id, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orchestratorId, state.organization, state.version, senderAgentId, route.recipientAgentId,
    route.channel, normalizedKind, signalInfo.content, JSON.stringify(payload || {}),
    signalInfo.signalType, signalInfo.signalBlob, route.delivery,
    scope.organizationId, scope.projectId
  );
  return {
    id: result.lastID, organization: state.organization, version: state.version,
    ...route, kind: normalizedKind, signalType: signalInfo.signalType
  };
}

function mapInboxRow(row) {
  const signal = unpackSignalPayload(row.signalBlob, row.signalType, row.payloadJson);
  const profile = organizationProfile(row.organization);
  const isAnonymous = Boolean(profile && profile.visibility === 'anonymous');
  return {
    ...row,
    senderAgentId: isAnonymous ? 'anonymous_worker' : row.senderAgentId,
    payload: parsePayload(row.payloadJson),
    signal,
    hasBiomimeticSignal: row.signalType !== 'text' && Boolean(signal)
  };
}

async function fetchInboxMessages(db, query) {
  const { orchestratorId, version, scope, afterId, requesterAgentId, limit } = query;
  return db.all(
    `SELECT m.id, m.organization, m.organization_version as organizationVersion, m.sender_agent_id as senderAgentId,
            recipient_agent_id as recipientAgentId, channel, kind, content, payload_json as payloadJson,
            m.signal_type as signalType, m.signal_blob as signalBlob,
            m.delivery, m.created_at as createdAt, sender.name as senderName,
            sender.name_meaning as senderNameMeaning, sender.role as senderRole,
            recipient.name as recipientName, recipient.name_meaning as recipientNameMeaning
     FROM agent_organization_messages m
     LEFT JOIN agents sender ON sender.id = m.sender_agent_id
     LEFT JOIN agents recipient ON recipient.id = m.recipient_agent_id
    WHERE m.orchestrator_id = ? AND m.organization_version = ? AND m.organization_id IS ? AND m.project_id IS ? AND m.id > ? AND m.sender_agent_id <> ?
       AND m.delivery = 'delivered' AND (m.recipient_agent_id IS NULL OR m.recipient_agent_id = ? OR m.recipient_agent_id = 'broadcast')
     ORDER BY m.id LIMIT ?`,
    orchestratorId, version, scope.organizationId, scope.projectId,
    Math.max(0, Number(afterId || 0)), requesterAgentId, requesterAgentId,
    Math.min(50, Math.max(1, Number(limit || 20)))
  );
}

async function fetchOrganizationMembers(db, orchestratorId) {
  return db.all(
    `SELECT id, name, name_meaning as nameMeaning, role, execution_mode as executionMode
       FROM agents WHERE id = ? OR parent_agent_id = ? ORDER BY execution_mode DESC, name ASC`,
    orchestratorId, orchestratorId
  );
}

async function inbox(db, options = {}) {
  const { orchestratorId, requesterAgentId, afterId = 0, limit = 20 } = options;
  await ensureTables(db);
  const state = await ensureActiveState(db, orchestratorId);
  await assertMember(db, orchestratorId, requesterAgentId);
  const scope = await fetchAgentScope(db, orchestratorId);
  const query = { orchestratorId, version: state.version, scope, afterId, requesterAgentId, limit };
  const rows = await fetchInboxMessages(db, query);
  const members = await fetchOrganizationMembers(db, orchestratorId);
  return {
    state,
    members,
    messages: rows.map(mapInboxRow)
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
