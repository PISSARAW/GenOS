'use strict';

const { candidateId, fail } = require('./liveMorphogenesisPolicy');
const { findMember } = require('../../qualityElevation/qualityFinalPlan');
const store = require('../teamRunStore');

async function prepare(input) {
  if (!input.run.adaptiveMorphogenesis) return input.run;
  const current = await store.load(input.db, input.run.teamRunId);
  if (current.execution.liveMorphogenesis) return current;
  const target = findMember(current.members, current.adaptiveMorphogenesis.targetMember);
  const workerId = candidateId(current);
  await require('../../topologyWorkerPersistenceService').ensureTopologyWorker(input.db, {
    workerId, parentId: current.missionId, workspaceId: input.parent.workspace_id,
    isolationMode: input.parent.isolation_mode, role: 'creative_worker', workerKind: target.workerKind,
    name: 'Candidat de remplacement A-Team', mission: target.mission,
    workerTokenLimit: target.executionBudgetTokens,
    executionBudget: { tokens: target.executionBudgetTokens },
    methodContract: target.methodContract, workerArtifactContract: target.workerArtifactContract,
    workerAssignment: target.workerAssignment, qualityElevation: target.qualityElevation,
    qualityRuntime: target.qualityRuntime
  });
  await require('../../missionIdentityService').attachAgent(input.db, {
    missionId: current.execution.runtimeMissionId, agentId: workerId, role: 'standby_creative_worker' });
  return store.update({ db: input.db, teamRunId: current.teamRunId, revision: current.revision,
    patch: { execution: { ...current.execution, liveMorphogenesis: { status: 'RESERVED',
      candidateWorkerId: workerId, priorWorkerId: target.workerId, memberId: target.memberId } } } });
}

async function assertPending(db, run, workerId) {
  const agent = await db.get(`SELECT a.id,a.role,a.status,a.runtime_pid,a.parent_agent_id,a.workspace_id,
    w.organization_id,w.project_id FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, workerId);
  if (!agent || agent.parent_agent_id !== run.missionId || agent.status !== 'idle' || agent.runtime_pid) {
    throw fail('ATEAM_LIVE_MORPH_MEMBER_ACTIVE', 'Replacement requires an idle owned member without a process.');
  }
  const execution = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? LIMIT 1', workerId);
  const garage = await db.get(`SELECT request_id FROM garage_queue WHERE worker_id=?
    AND status IN ('queued','claimed','running') LIMIT 1`, workerId);
  if (execution || garage) throw fail('ATEAM_LIVE_MORPH_MEMBER_STARTED', 'An execution or reservation already exists for this member.');
  return agent;
}

async function controllerScope(db, run) {
  const controller = await db.get(`SELECT a.id,a.execution_mode,a.workspace_id,w.organization_id,w.project_id
    FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, run.missionId);
  if (controller?.execution_mode !== 'orchestrator' || !controller.organization_id || !controller.project_id) {
    throw fail('ATEAM_LIVE_MORPH_SCOPE_REQUIRED', 'The real controller must have a tenant-bound workspace.');
  }
  const membership = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id=? AND agent_id=?',
    run.execution.runtimeMissionId, controller.id);
  if (!membership) throw fail('ATEAM_LIVE_MORPH_SCOPE_REQUIRED', 'The controller does not belong to this runtime mission.');
  return controller;
}

module.exports = { prepare, assertPending, controllerScope };
