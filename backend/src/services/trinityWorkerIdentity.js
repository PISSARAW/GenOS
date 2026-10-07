'use strict';
const { randomUUID } = require('node:crypto');
const generatedErrors = new WeakSet();
const rejectionSources = new WeakMap();

function failure(code, diagnostic) {
  const error = Object.assign(new Error(`${code}: ${diagnostic.reason}`), { code,
    diagnostic: Object.freeze({ schema: 'genos.worker-mission-diagnostic/v1', ...diagnostic }) });
  generatedErrors.add(error);
  return error;
}

function requestedIdentity(input) {
  const value = input.missionId;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw failure('BIOLOGICAL_WORKER_MISSION_ID_INVALID', {
      reason: 'invalid_requested_identity', workerId: input.agentId, requestedMissionId: null
    });
  }
  return value;
}

async function tenantAgent(db, agentId) {
  return db.get(`SELECT a.id, a.execution_mode, a.parent_agent_id, a.workspace_id,
    w.id AS tenant_workspace_id, w.organization_id, w.project_id
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
}

function diagnosticFor(worker, requestedMissionId, assignments) {
  const candidates = assignments.map(row => Object.freeze({ missionId: row.mission_id,
    status: row.status, matchesRequestedIdentity: requestedMissionId === null || row.mission_id === requestedMissionId }));
  return { workerId: worker.id, requestedMissionId, assignments: Object.freeze(candidates) };
}

function selectionReason(requestedMissionId, assignments) {
  if (!assignments.length) return 'no_assignments';
  if (requestedMissionId === null) return 'no_active_assignments';
  const requested = assignments.find(row => row.mission_id === requestedMissionId);
  return requested ? 'requested_mission_inactive' : 'requested_mission_not_assigned';
}

function selectMission(worker, requestedMissionId, assignments) {
  const candidates = assignments.filter(row => row.status === 'active'
    && (requestedMissionId === null || row.mission_id === requestedMissionId));
  const diagnostic = { ...diagnosticFor(worker, requestedMissionId, assignments),
    activeCandidateIds: Object.freeze(candidates.map(row => row.mission_id)), candidateCount: candidates.length };
  if (!candidates.length) throw failure('BIOLOGICAL_WORKER_MISSION_NOT_FOUND', {
    ...diagnostic, reason: 'none', cause: selectionReason(requestedMissionId, assignments)
  });
  if (candidates.length !== 1) throw failure('BIOLOGICAL_WORKER_MISSION_AMBIGUOUS', { ...diagnostic, reason: 'multiple' });
  return candidates[0];
}

function missingWorkspaceReference(agent) {
  return agent.workspace_id !== null && agent.workspace_id !== undefined && !agent.tenant_workspace_id;
}

function assertTenant(worker, authority, details) {
  if (!worker.id || !authority?.id) {
    throw failure('BIOLOGICAL_WORKER_TENANT_MISMATCH', { ...details,
      reason: 'tenant_authority_missing', cause: 'authority_identity_missing' });
  }
  if (missingWorkspaceReference(worker) || missingWorkspaceReference(authority)) {
    throw failure('BIOLOGICAL_WORKER_TENANT_MISMATCH', { ...details,
      reason: 'tenant_authority_missing', cause: 'workspace_reference_missing' });
  }
  if (authority.organization_id !== worker.organization_id || authority.project_id !== worker.project_id) {
    throw failure('BIOLOGICAL_WORKER_TENANT_MISMATCH', { ...details, reason: 'tenant_mismatch' });
  }
}

async function assertAuthorities(db, worker, mission) {
  const diagnostic = { workerId: worker.id, requestedMissionId: mission.mission_id };
  const orchestrator = await tenantAgent(db, mission.orchestrator_agent_id);
  assertTenant(worker, orchestrator, { ...diagnostic, authority: 'mission_orchestrator',
    authorityId: mission.orchestrator_agent_id || null });
  if (!worker.parent_agent_id) return;
  const parent = await tenantAgent(db, worker.parent_agent_id);
  assertTenant(worker, parent, { ...diagnostic, authority: 'worker_parent', authorityId: worker.parent_agent_id });
}

async function resolveAssignment(db, input) {
  const requestedMissionId = requestedIdentity(input);
  const worker = await tenantAgent(db, input.agentId);
  if (worker?.execution_mode !== 'worker') throw failure('BIOLOGICAL_WORKER_IDENTITY_INVALID', {
    reason: 'worker_missing_or_wrong_mode', workerId: input.agentId, requestedMissionId
  });
  const assignments = await db.all(`SELECT DISTINCT m.* FROM missions m
    JOIN mission_agents ma ON ma.mission_id = m.mission_id
    WHERE ma.agent_id = ? ORDER BY m.mission_id`, worker.id);
  const mission = selectMission(worker, requestedMissionId, assignments);
  await assertAuthorities(db, worker, mission);
  return mission;
}

async function resolve(db, input) {
  try { return await resolveAssignment(db, input); }
  catch (error) {
    if (generatedErrors.has(error)) rejectionSources.set(error, { db, agentId: input.agentId,
      code: error.code, diagnostic: error.diagnostic, message: error.message });
    throw error;
  }
}

async function recordRejected(db, input) {
  const source = rejectionSources.get(input.error);
  if (!source || source.db !== db || source.agentId !== input.agentId) return null;
  if (source.eventId) return { eventId: source.eventId, status: 'recorded' };
  const worker = await tenantAgent(db, source.agentId);
  if (!worker) return null;
  const eventId = `worker-mission-rejected:${randomUUID()}`;
  const payload = { schema: 'genos.worker-mission-rejection/v1', source: 'worker-mission-resolver',
    workerId: worker.id, requestedMissionId: source.diagnostic.requestedMissionId,
    organizationId: worker.organization_id, projectId: worker.project_id,
    code: source.code, diagnostic: source.diagnostic,
    outcome: 'refused_before_binding', promotionAuthorized: false };
  await db.run(`INSERT INTO telemetry_events (event_id, session_id, agent_id, event_type,
    action, detail, payload_json, severity, organization_id, project_id)
    VALUES (?, ?, ?, 'BIOLOGICAL_WORKER_MISSION_REJECTED', 'BIND_WORKER_MISSION', ?, ?, 'error', ?, ?)`,
  [eventId, `worker-identity:${worker.id}`, worker.id, source.message,
    JSON.stringify(payload), worker.organization_id, worker.project_id]);
  source.eventId = eventId;
  return { eventId, status: 'recorded' };
}

module.exports = { resolve, recordRejected };
