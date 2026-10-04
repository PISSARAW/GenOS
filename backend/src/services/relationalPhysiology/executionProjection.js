'use strict';

const { digest } = require('./index');
const { ROLES, TYPES, ACKS } = require('./catalog');

const ACTIVE = new Set(['idle', 'running', 'Active']);
const LIMIT = 2048;

function checkedRows(rows, limit) {
  if (rows.length > limit) throw new Error('RPE_SCOPE_GRAPH_TOO_LARGE');
  return rows;
}

function agentState(row) {
  return ACTIVE.has(row.status) ? 'active' : 'suspended';
}

function agentRole(row) {
  const role = String(row.role || '').trim().toLowerCase().replace(/[- ]/g, '_');
  if (!ROLES.includes(role)) throw new Error('RPE_UNMAPPED_AGENT_ROLE');
  return role;
}

function relationOf(row, scope) {
  if (!TYPES.includes(row.relation_type)) throw new Error('RPE_UNMAPPED_RELATION_TYPE');
  const metadata = JSON.parse(row.metadata_json || '{}');
  const state = metadata.state || 'active';
  const validFrom = metadata.validFrom ?? 0;
  const validUntil = metadata.validUntil ?? null;
  return {
    id: row.id, sourceId: row.source_agent_id, targetId: row.target_agent_id,
    type: row.relation_type, state, validFrom, validUntil, scope
  };
}

async function scopedRows(db, scope) {
  const relations = checkedRows(await db.all(
    `SELECT id, source_agent_id, target_agent_id, relation_type, metadata_json
       FROM agent_relations WHERE organization_id = ? AND project_id = ?
       ORDER BY id LIMIT ?`,
    [scope.organizationId, scope.projectId, LIMIT + 1]
  ), LIMIT);
  return relations;
}

async function loadProjection(db, request) {
  const rows = await scopedRows(db, request.scope);
  const ids = [...new Set([request.actorId, request.receiverId,
    ...rows.flatMap((row) => [row.source_agent_id, row.target_agent_id])])].sort();
  if (ids.length > 256) throw new Error('RPE_SCOPE_AGENTS_TOO_LARGE');
  const marks = ids.map(() => '?').join(',');
  const agents = await db.all(
    `SELECT id, role, status FROM agents WHERE id IN (${marks}) ORDER BY id`, ids
  );
  const grant = await db.get(
    `SELECT refs_json, valid_until_ms, required_ack
       FROM rpe_communication_grants
      WHERE organization_id = ? AND project_id = ? AND actor_id = ? AND receiver_id = ?`,
    [request.scope.organizationId, request.scope.projectId, request.actorId, request.receiverId]
  );
  if (grant && !ACKS.includes(grant.required_ack)) throw new Error('RPE_INVALID_GRANT_ACK');
  const context = {
    scope: request.scope, revision: 0, asOf: request.at, validUntil: request.at + 60_000,
    agents: agents.map((row) => ({ id: row.id, role: agentRole(row), state: agentState(row) })),
    relations: rows.map((row) => relationOf(row, request.scope)), origins: [], groundings: []
  };
  context.revision = Number.parseInt(digest({ agents: context.agents,
    relations: context.relations, grant: grant || null }).slice(0, 12), 16);
  return { context, grant };
}

function grantedRefs(grant, request) {
  if (!grant) return [];
  const records = JSON.parse(grant.refs_json);
  if (!Array.isArray(records) || records.length > 4096) throw new Error('RPE_INVALID_GRANT_REFS');
  return request.refs.filter((ref) => records.some((entry) => entry.id === ref.id
    && entry.hash === ref.hash && entry.kind === ref.kind)).map((ref) => ref.id);
}

function authorizationFor(projection, request) {
  const { grant } = projection;
  const active = Boolean(grant && Number.isSafeInteger(grant.valid_until_ms)
    && grant.valid_until_ms > Date.now());
  return {
    allowed: active, operationId: request.operationId, actorId: request.actorId,
    validUntil: active ? grant.valid_until_ms : request.at,
    requestHash: digest(request), recipientIds: active ? [request.receiverId] : [],
    readableRefIds: active ? grantedRefs(grant, request) : [],
    requiredAck: active ? grant.required_ack : 'none'
  };
}

module.exports = { loadProjection, authorizationFor };
