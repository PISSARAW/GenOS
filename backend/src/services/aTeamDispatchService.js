'use strict';

/**
 * @file aTeamDispatchService.js
 * @description Dispatch orchestration for the A-Team. It composes the team,
 * builds the deterministic stage plan, launches the independent producers and
 * detaches a stage runner that promotes the consumer stages once their
 * dependencies are terminal. Kept out of orchestratorActions so that file stays
 * within the line budget.
 */
const path = require('path');
const { spawn } = require('child_process');
const workerGarage = require('./workerGarageService');
const aTeamCoordination = require('./aTeamCoordinationService');
const aTeamService = require('./aTeamService');
const aTeamStageScheduler = require('./aTeamStageScheduler');
const { emit } = require('./agentOrchestrationState');

function stageRunnerPath() {
  return path.resolve(__dirname, '../../bin/genos-ateam-stage-runner.cjs');
}

function spawnStageRunner({ context, plan, parentWorkspaceRoot }) {
  const payload = {
    plan,
    bridgePath: context.bridgePath,
    repoRoot: context.repoRoot,
    request: context.request,
    parentWorkspaceRoot,
    skipWorkerIds: plan.members.filter((member) => member.pipelineStage === 0).map((member) => member.workerId),
    pollMs: 500,
    timeoutMs: Number(context.request.timeoutMs) || 15 * 60 * 1000
  };
  const runner = spawn(process.execPath, [stageRunnerPath(), JSON.stringify(payload)], {
    cwd: context.repoRoot,
    detached: true,
    stdio: 'ignore'
  });
  runner.unref();
  return runner;
}

function readSubSystems(request) {
  const raw = request.sub_systems || request.subsystems || request.domains;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split(',').map((value) => value.trim()).filter(Boolean);
  return [];
}

function requestedSuccessCriteria(request) {
  return request.success_criteria || request.successCriteria || request.acceptance_criteria || request.acceptanceCriteria;
}

function requireReadyTeam(readiness) {
  if (readiness.ready) return;
  throw Object.assign(new Error(`A-Team is not ready: ${readiness.blockers.join(', ')}.`), {
    code: 'A_TEAM_NOT_READY', readiness
  });
}

function emitImmediateCompletion({ runner, orchestratorId, planId }) {
  if (!runner) emit(orchestratorId, 'A_TEAM_STAGES_COMPLETED', 'SCHEDULE_STAGES', 'A-Team has no deferred stages.', { planId }, 'info');
}

async function dispatchTeam({ db, context, parent, launchWorker }) {
  const request = context.request || {};
  const garage = await workerGarage.state(db, context.orchestratorId);
  const projectGoal = request.project_goal || request.projectGoal || request.goal || request.mission || context.task;
  const team = aTeamCoordination.composeTeam({
    projectGoal,
    subSystems: readSubSystems(request),
    assignedRoles: request.assigned_roles || request.assignedRoles,
    modelTiers: request.model_tiers || request.modelTiers,
    successCriteria: requestedSuccessCriteria(request),
    available: garage.available
  });
  requireReadyTeam(team.readiness);
  const plan = aTeamStageScheduler.stagePlanFor({ orchestratorId: context.orchestratorId, members: team.members });
  // Independent producers start now; the detached runner waits for them before
  // launching the consumer stages.
  const stageZero = plan.members.filter((member) => member.pipelineStage === 0);
  const accepted = stageZero.map((member, index) => launchWorker({ context, member, index: index + 1, parent, suppliedWorkerId: member.workerId }));
  const runner = plan.maxStage > 0 ? spawnStageRunner({ context, plan, parentWorkspaceRoot: parent.workspace_root }) : null;
  emitImmediateCompletion({ runner, orchestratorId: context.orchestratorId, planId: plan.planId });
  return {
    orchestratorId: context.orchestratorId,
    aTeam: {
      status: 'accepted',
      projectGoal,
      capacity: workerGarage.MAX_ACTIVE_WORKERS,
      organization: team.organization,
      teamContractVersion: team.teamContract.version,
      teamContractHash: team.teamContract.contractHash,
      readiness: team.readiness,
      capabilityContract: team.capabilityContract,
      capabilityAudit: team.capabilityAudit,
      planId: plan.planId,
      stages: aTeamService.planStages(team.members).stages,
      stageRunnerPid: runner ? runner.pid : null,
      handoffs: team.handoffs.length,
      members: accepted
    }
  };
}

module.exports = { dispatchTeam, spawnStageRunner, readSubSystems };
