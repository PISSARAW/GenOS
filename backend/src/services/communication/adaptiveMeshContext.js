'use strict';

const { routeMessage, assertRoutingAuthority } = require('../organizationRouting');

const MAX_RECIPIENTS = 100;
const INACTIVE = new Set(['completed', 'terminated', 'apoptosis', 'error', 'failed', 'unverified', 'quarantined']);

function meshError(code) {
  return Object.assign(new Error(code), { code });
}

async function hasTable(db, name) {
  return Boolean(await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", name));
}

async function requireTables(db) {
  for (const name of ['agents', 'workspaces', 'missions', 'mission_agents']) {
    if (!await hasTable(db, name)) throw meshError('MESH_CONTEXT_UNAVAILABLE');
  }
}

function missionIdOf(input) {
  const missionId = input.intent.missionId;
  if (typeof missionId !== 'string' || !missionId.trim()) throw meshError('MESH_MISSION_REQUIRED');
  return missionId;
}

function recipientIds(decision) {
  if (!Array.isArray(decision.recipients)) throw meshError('MESH_RECIPIENTS_INVALID');
  if (decision.recipients.length > MAX_RECIPIENTS) throw meshError('MESH_RECIPIENT_CAPACITY');
  if (decision.recipients.some(id => typeof id !== 'string' || !id.trim())) {
    throw meshError('MESH_RECIPIENTS_INVALID');
  }
  return [...new Set(decision.recipients)];
}

async function agentRows(db, ids) {
  const marks = ids.map(() => '?').join(',');
  return db.all(`SELECT a.id, a.role, a.parent_agent_id, a.execution_mode, a.status,
      w.organization_id AS organizationId, w.project_id AS projectId
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id IN (${marks})`, ids);
}

function assertScope(sender, declared) {
  if (!sender?.organizationId || !sender.projectId) throw meshError('MESH_SCOPE_UNAVAILABLE');
  for (const key of ['organizationId', 'projectId']) {
    if (declared?.[key] != null && declared[key] !== sender[key]) throw meshError('MESH_SCOPE_MISMATCH');
  }
}

async function missionContext(db, input) {
  const missionId = missionIdOf(input);
  const mission = await db.get('SELECT orchestrator_agent_id AS owner FROM missions WHERE mission_id = ?', missionId);
  if (!mission?.owner) throw meshError('MESH_MISSION_UNAVAILABLE');
  const rows = await db.all('SELECT agent_id FROM mission_agents WHERE mission_id = ?', missionId);
  const members = new Set(rows.map(row => row.agent_id));
  if (!members.has(input.intent.senderAgentId)) throw meshError('MESH_MISSION_DENIED');
  if (!members.has(mission.owner)) throw meshError('MESH_MISSION_OWNER_UNAVAILABLE');
  return { missionId, owner: mission.owner, members };
}

async function organizationState(db, owner) {
  const organizations = require('../dynamicOrganizationService');
  const row = await hasTable(db, 'agent_organization_state')
    ? await db.get('SELECT organization, version, policy_json FROM agent_organization_state WHERE orchestrator_id = ?', owner)
    : null;
  const organization = row?.organization || 'specialist_expert_committee';
  const profile = organizations.organizationProfile(organization);
  if (!profile) throw meshError('MESH_TOPOLOGY_UNAVAILABLE');
  const policy = canonicalPolicy(profile, row ? JSON.parse(row.policy_json) : {});
  return { orchestratorId: owner, organization, version: row?.version || 0, policy };
}

function canonicalPolicy(profile, stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw meshError('MESH_TOPOLOGY_UNAVAILABLE');
  for (const key of ['routing', 'visibility', 'topology', 'exchange']) {
    if (stored[key] !== undefined && stored[key] !== profile[key]) throw meshError('MESH_TOPOLOGY_UNAVAILABLE');
  }
  return { ...profile, ...stored };
}

function belongsToOwner(agent, owner) {
  if (agent.id === owner) return agent.execution_mode === 'orchestrator';
  return agent.execution_mode === 'worker' && agent.parent_agent_id === owner;
}

function assertSender(sender, intent) {
  if (!INACTIVE.has(sender.status)) return;
  if (sender.status === 'completed' && intent.checkpoint === 'MISSION_COMPLETED') return;
  throw meshError('MESH_SENDER_INACTIVE');
}

function assertOwner(owner, sender) {
  if (!owner || owner.execution_mode !== 'orchestrator') throw meshError('MESH_MISSION_OWNER_UNAVAILABLE');
  if (owner.organizationId !== sender.organizationId || owner.projectId !== sender.projectId) {
    throw meshError('MESH_MISSION_OWNER_UNAVAILABLE');
  }
}

function scopeDenial(context, recipient) {
  if (!recipient || !context.members.has(recipient.id)) return 'MESH_MISSION_DENIED';
  if (recipient.id === context.sender.id) return 'MESH_SELF_RECIPIENT';
  if (INACTIVE.has(recipient.status)) return 'MESH_RECIPIENT_INACTIVE';
  if (!belongsToOwner(recipient, context.owner)) return 'MESH_ORGANIZATION_DENIED';
  if (recipient.organizationId !== context.sender.organizationId) return 'MESH_SCOPE_MISMATCH';
  if (recipient.projectId !== context.sender.projectId) return 'MESH_SCOPE_MISMATCH';
  return null;
}

function audienceDenial(context, recipient) {
  const requested = context.intent.requestedAudience;
  if (Array.isArray(requested) && !requested.includes(recipient.id)) return 'MESH_AUDIENCE_DENIED';
  return routingDenial(context, recipient);
}

function messageKind(intent) {
  if (['high', 'critical'].includes(intent.risk)) return 'critical';
  if (intent.purpose === 'handoff') return 'handoff';
  if (intent.purpose === 'challenge') return 'challenge';
  return 'evidence';
}

function hiddenPeer(context, recipient) {
  if (!['anonymous', 'sealed'].includes(context.state.policy.visibility)) return false;
  return context.sender.id !== context.owner && recipient.id !== context.owner;
}

function routingDenial(context, recipient) {
  if (hiddenPeer(context, recipient)) return 'MESH_TOPOLOGY_DENIED';
  try {
    assertRoutingAuthority({ organization: context.state.organization, policy: context.state.policy,
      sender: context.sender, recipientAgentId: recipient.id, orchestratorId: context.owner });
    const route = routeMessage({ state: context.state, sender: context.sender,
      recipientAgentId: recipient.id, kind: messageKind(context.intent) });
    if (route.delivery !== 'delivered') return 'MESH_TOPOLOGY_BUFFERED';
    if (route.recipientAgentId !== recipient.id) return 'MESH_TOPOLOGY_DENIED';
  } catch (_) { return 'MESH_TOPOLOGY_DENIED'; }
  return null;
}

function partitionRecipients(context, ids, agents) {
  const allowed = [];
  const excluded = missingRequested(context.intent, ids);
  for (const agentId of ids) {
    const recipient = agents.get(agentId);
    const reason = scopeDenial(context, recipient) || audienceDenial(context, recipient);
    if (reason) excluded.push({ agentId, reason });
    else allowed.push(agentId);
  }
  return { allowed, excluded };
}

function missingRequested(intent, ids) {
  if (!Array.isArray(intent.requestedAudience)) return [];
  const present = new Set(ids);
  return [...new Set(intent.requestedAudience)].filter(id => !present.has(id))
    .map(agentId => ({ agentId, reason: 'MESH_REQUIRED_RECIPIENT_MISSING' }));
}

async function loadMeshContext(input) {
  await requireTables(input.db);
  const ids = recipientIds(input.decision);
  const mission = await missionContext(input.db, input);
  const rows = await agentRows(input.db, [...new Set([input.intent.senderAgentId, mission.owner, ...ids])]);
  const agents = new Map(rows.map(row => [row.id, row]));
  const sender = agents.get(input.intent.senderAgentId);
  assertScope(sender, input.intent.scope);
  assertSender(sender, input.intent);
  if (!belongsToOwner(sender, mission.owner)) throw meshError('MESH_ORGANIZATION_DENIED');
  const owner = agents.get(mission.owner);
  assertOwner(owner, sender);
  const state = await organizationState(input.db, mission.owner);
  const context = { ...mission, sender, state, intent: input.intent };
  return { ...context, ...partitionRecipients(context, ids, agents),
    scope: { organizationId: sender.organizationId, projectId: sender.projectId } };
}

module.exports = { MAX_RECIPIENTS, loadMeshContext, meshError };
