'use strict';

const { digest } = require('../../relationalPhysiology');
const { TYPES, BLIND_TYPES } = require('../../relationalPhysiology/catalog');
const { fail } = require('./teamRelationalPolicy');

function role(row) {
  if (row.execution_mode === 'orchestrator') return 'orchestrator';
  if (row.execution_mode === 'worker') return 'worker';
  throw fail('ATEAM_RPE_ACTOR_ROLE_INVALID');
}

function agent(row) {
  return { id: row.id, role: role(row),
    state: row.isolation_mode !== 'Quarantine' && ['idle', 'running', 'Active'].includes(row.status) ? 'active' : 'suspended' };
}

function relation(row, scope) {
  if (!TYPES.includes(row.relation_type)) throw fail('ATEAM_RPE_RELATION_INVALID');
  const metadata = JSON.parse(row.metadata_json || '{}');
  return { id: row.id, sourceId: row.source_agent_id, targetId: row.target_agent_id,
    type: row.relation_type, state: metadata.state || 'active', scope,
    validFrom: metadata.validFrom ?? 0, validUntil: metadata.validUntil ?? null };
}

async function load(db, input) {
  const ids = [...new Set([input.run.missionId, ...input.run.members.map(m => m.workerId)])];
  if (ids.length > 256) throw fail('ATEAM_RPE_GRAPH_TOO_LARGE');
  const marks = ids.map(() => '?').join(',');
  const rows = await db.all(`SELECT a.id,a.execution_mode,a.status,a.isolation_mode,w.organization_id,w.project_id
    FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id IN (${marks}) ORDER BY a.id`, ...ids);
  if (rows.length !== ids.length || rows.some(r => r.organization_id !== input.scope.organizationId
    || r.project_id !== input.scope.projectId)) throw fail('ATEAM_RPE_SCOPE_MISMATCH');
  const all = await db.all(`SELECT * FROM agent_relations WHERE organization_id=? AND project_id=?
    ORDER BY id LIMIT 2049`, input.scope.organizationId, input.scope.projectId);
  if (all.length > 2048) throw fail('ATEAM_RPE_GRAPH_TOO_LARGE');
  const relations = all.filter(r => ids.includes(r.source_agent_id) && ids.includes(r.target_agent_id))
    .map(row => relation(row, input.scope));
  const policyHash = digest({ scope: input.scope, members: ids.sort(), relations });
  return { policyHash, context: { scope: input.scope, revision: parseInt(policyHash.slice(0, 12), 16),
    asOf: input.now, validUntil: input.expiresAt, agents: rows.map(agent), relations,
    origins: [], groundings: [] } };
}

function blind(context, parties, now) {
  return context.relations.some(r => BLIND_TYPES.includes(r.type) && r.state === 'active'
    && r.validFrom <= now && (r.validUntil === null || now < r.validUntil)
    && [r.sourceId, r.targetId].every(id => parties.includes(id)));
}

function refs(handoff) {
  return [
    { id: 'artifact', hash: digest(handoff.artifactPayload), kind: 'evidence' },
    { id: 'claims', hash: digest(handoff.claimRefs), kind: 'conclusion' },
    { id: 'context', hash: digest({ assumptions: handoff.assumptions || [], knownRisks: handoff.knownRisks || [],
      openQuestions: handoff.openQuestions || [] }), kind: 'context' }
  ];
}

module.exports = { load, blind, refs };
