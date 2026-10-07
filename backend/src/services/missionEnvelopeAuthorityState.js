'use strict';

const values = require('./trinityProvenanceValues');
const provenance = require('./gvxMissionProvenance');

async function identity(db, agentId) {
  const agent = await db.get('SELECT id, workspace_id, execution_mode, parent_agent_id, role FROM agents WHERE id = ?', agentId);
  if (!agent) throw values.failure('EXECUTION_AUTHORITY_AGENT_MISSING');
  return { agentId: agent.id, workspaceId: agent.workspace_id, executionMode: agent.execution_mode,
    parentId: agent.parent_agent_id || null, role: agent.role || null };
}

async function lease(db, missionId) {
  if (!await db.get("SELECT name FROM sqlite_master WHERE name = 'mission_execution_authority'")) return null;
  const row = await db.get('SELECT * FROM mission_execution_authority WHERE mission_id = ?', missionId);
  return row ? { agentId: row.agent_id, generation: row.generation, tokenHash: values.digest(row.token) } : null;
}

async function assertCurrent(db, envelope) {
  if (Date.now() >= Date.parse(envelope.expiresAt)) throw values.failure('EXECUTION_AUTHORITY_EXPIRED');
  const actual = await identity(db, envelope.scope.entityId);
  if (values.digest(actual) !== values.digest(envelope.identity)) throw values.failure('EXECUTION_AUTHORITY_IDENTITY_CHANGED');
  const scope = await provenance.agentScope(db, actual.agentId);
  if (values.digest(scope) !== values.digest(envelope.scope)) throw values.failure('EXECUTION_AUTHORITY_TENANT_CHANGED');
  await assertMission(db, envelope);
  await assertLease(db, envelope);
  await require('./missionExecutionAuthority').assertAgentCurrent(db, actual.agentId);
  await assertAgentStatus(db, actual.agentId);
  if (actual.parentId) await assertAgentStatus(db, actual.parentId);
}

async function assertMission(db, envelope) {
  const mission = await db.get('SELECT * FROM missions WHERE mission_id = ?', envelope.missionId);
  if (mission?.status !== 'active') throw values.failure('EXECUTION_AUTHORITY_MISSION_INACTIVE');
  if (mission.orchestrator_agent_id !== envelope.orchestratorId) throw values.failure('MISSION_AUTHORITY_STALE');
  const member = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id = ? AND agent_id = ?',
    envelope.missionId, envelope.identity.agentId);
  if (!member && mission.orchestrator_agent_id !== envelope.identity.agentId) throw values.failure('EXECUTION_AUTHORITY_MEMBERSHIP_REVOKED');
  const parentScope = await provenance.agentScope(db, mission.orchestrator_agent_id);
  if (!provenance.sameTenant(parentScope, envelope.scope)) throw values.failure('EXECUTION_AUTHORITY_TENANT_CHANGED');
}

async function assertLease(db, envelope) {
  const actual = await lease(db, envelope.missionId);
  if (values.digest(actual) !== values.digest(envelope.lease)) throw values.failure('MISSION_AUTHORITY_STALE');
  if (!actual) return;
  const row = await db.get('SELECT * FROM mission_execution_authority WHERE mission_id = ?', envelope.missionId);
  if (row.state === 'failed') throw values.failure('MISSION_AUTHORITY_STALE');
}

async function assertAgentStatus(db, agentId) {
  const agent = await db.get('SELECT status, isolation_mode FROM agents WHERE id = ?', agentId);
  if (['quarantined', 'apoptosis', 'terminated'].includes(agent?.status) || agent?.isolation_mode === 'Quarantine') {
    throw values.failure('EXECUTION_AUTHORITY_AGENT_REVOKED');
  }
}

module.exports = { identity, lease, assertCurrent };
