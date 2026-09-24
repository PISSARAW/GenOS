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
const aTeamRuntime = require('./aTeam/aTeamRuntime');
const { emit } = require('./agentOrchestrationState');

function stageRunnerPath() {
  return path.resolve(__dirname, '../../bin/genos-ateam-stage-runner.cjs');
}

function spawnStageRunner({ context, plan, parentWorkspaceRoot, skipWorkerIds, runnerToken }) {
  const payload = {
    plan,
    teamRunId: plan.planId,
    runnerToken,
    bridgePath: context.bridgePath,
    repoRoot: context.repoRoot,
    request: context.request,
    parentWorkspaceRoot,
    skipWorkerIds: [...new Set([
      ...plan.members.filter((member) => member.pipelineStage === 0).map((member) => member.workerId),
      ...(Array.isArray(skipWorkerIds) ? skipWorkerIds : [])
    ])],
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
  const setup = await prepareDispatch({ db, context });
  const canonical = await createCanonicalRun(setup);
  if (shouldReturnExisting(canonical)) return existingRunResponse(context, canonical, setup.team);
  const activeRun = await advanceRunToExecution(db, canonical.run);
  const execution = await aTeamRuntime.claimExecution({ db, teamRunId: activeRun.teamRunId, ownerId: context.orchestratorId });
  if (!execution.claimed) return existingRunResponse(context, { run: execution.run }, setup.team);
  try {
    return await launchDispatch({ setup, activeRun: execution.run, runnerToken: execution.token, context, parent, launchWorker });
  } catch (error) {
    await aTeamRuntime.releaseExecution({ db, teamRunId: activeRun.teamRunId, token: execution.token });
    throw error;
  }
}

async function prepareDispatch({ db, context }) {
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
  return { db, request, garage, projectGoal, team, context };
}

function createCanonicalRun(setup) {
  const { db, request, projectGoal, team, context } = setup;
  return aTeamRuntime.createRun({
    db,
    idempotencyKey: request.idempotencyKey || request.requestId || context.requestId || context.orchestratorId,
    missionId: context.orchestratorId,
    goal: projectGoal,
    successCriteria: requestedSuccessCriteria(request) || [],
    organization: team.organization,
    requiredCapabilities: team.capabilityContract.required.map((capability) => ({ capability, weight: 1 })),
    status: 'READY',
    phase: 'PREBRIEF',
    members: team.members
  });
}

function shouldReturnExisting(canonical) {
  return !canonical.created && !['FORMING', 'READY', 'RUNNING'].includes(canonical.run.status);
}

async function launchDispatch({ setup, activeRun, runnerToken, context, parent, launchWorker }) {
  const { team, garage, projectGoal } = setup;
  const plan = aTeamStageScheduler.stagePlanFor({ orchestratorId: context.orchestratorId, members: activeRun.members, planId: activeRun.teamRunId });
  const existingWorkerIds = await workersAlreadyPresent(setup.db, plan.members);
  // Independent producers start now; the detached runner waits for them before
  // launching the consumer stages.
  const stageZero = plan.members.filter((member) => member.pipelineStage === 0 && !existingWorkerIds.has(member.workerId));
  const accepted = await Promise.all(stageZero.map((member, index) => launchWorker({ context, member, index: index + 1, parent, suppliedWorkerId: member.workerId })));
  const runner = plan.maxStage > 0 ? spawnStageRunner({ context, plan, parentWorkspaceRoot: parent.workspace_root, skipWorkerIds: [...existingWorkerIds], runnerToken }) : null;
  if (!runner) await aTeamRuntime.releaseExecution({ db: setup.db, teamRunId: activeRun.teamRunId, token: runnerToken });
  emitImmediateCompletion({ runner, orchestratorId: context.orchestratorId, planId: plan.planId });
  return {
    orchestratorId: context.orchestratorId,
    aTeam: {
      status: 'accepted',
      teamRunId: activeRun.teamRunId,
      workGraphId: activeRun.workGraphId,
      runRevision: activeRun.revision,
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

async function workersAlreadyPresent(db, members) {
  const rows = await Promise.all(members.map(async (member) => {
    const row = await db.get('SELECT id FROM agents WHERE id = ?', member.workerId);
    return row ? member.workerId : null;
  }));
  return new Set(rows.filter(Boolean));
}

async function advanceRunToExecution(db, run) {
  let current = run;
  if (current.status === 'FORMING') {
    current = await aTeamRuntime.transitionRun({ db, teamRunId: current.teamRunId, revision: current.revision, patch: { status: 'READY', phase: 'FORMATION' } });
  }
  if (current.phase === 'FORMATION') {
    current = await aTeamRuntime.transitionRun({ db, teamRunId: current.teamRunId, revision: current.revision, patch: { phase: 'PREBRIEF' } });
  }
  if (current.status === 'READY') {
    current = await aTeamRuntime.transitionRun({ db, teamRunId: current.teamRunId, revision: current.revision, patch: { status: 'RUNNING', phase: 'EXECUTION' } });
  }
  return current;
}

function existingRunResponse(context, canonical, team) {
  return {
    orchestratorId: context.orchestratorId,
    aTeam: {
      status: canonical.run.status.toLowerCase(),
      teamRunId: canonical.run.teamRunId,
      workGraphId: canonical.run.workGraphId,
      runRevision: canonical.run.revision,
      reused: true,
      organization: canonical.run.organization || team.organization,
      members: []
    }
  };
}

module.exports = { dispatchTeam, spawnStageRunner, readSubSystems, advanceRunToExecution };
