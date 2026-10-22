'use strict';

/**
 * @file multiteamExecutionAdapter.js
 * @description Adaptateur reutilisable pour l'execution d'une sous-equipe multiteam.
 */
const runtime = require('../aTeamRuntime');
const store = require('../teamRunStore');
const scheduler = require('../../aTeamStageScheduler');
const { executeTeamRun } = require('../execution/teamExecutionService');
const dispatchService = require('../../aTeamDispatchService');

function validateInput(input) {
  if (!input.db) throw coded('A database handle is required.', 'ATEAM_MTS_DB_REQUIRED');
  if (!input.childRunId) throw coded('A child TeamRun is required.', 'ATEAM_MTS_CHILD_RUN_REQUIRED');
}

async function loadAndAdvance(input) {
  const run = await store.load(input.db, input.childRunId);
  if (!run) throw coded('Unknown child TeamRun.', 'ATEAM_MTS_CHILD_RUN_UNKNOWN');
  return dispatchService.advanceRunToExecution(input.db, run);
}

function launchMember(member, input) {
  if (typeof input.launchWorker === 'function') return input.launchWorker(member, input);
  return defaultLaunch(member, input);
}

async function runChildTeam(context) {
  const { input, run, claimed, plan, skipWorkerIds } = context;
  const result = await executeTeamRun({
    db: input.db, teamRunId: run.teamRunId, runnerToken: claimed.token, plan,
    executeTeam: input.executeTeam,
    launch: (member) => launchMember(member, input),
    onBlocked: (member, reason) => markBlocked(input, member.workerId, reason),
    options: { skipWorkerIds, pollMs: input.pollMs || 500,
      timeoutMs: input.timeoutMs || 15 * 60 * 1000 }
  });
  return result;
}

function buildResult(run, result) {
  const persisted = null;
  const accepted = result?.accepted === true || result?.completion?.success === true;
  return {
    status: accepted ? 'SUCCEEDED' : (result?.status === 'BLOCKED' ? 'WAITING' : 'FAILED'),
    childRunId: run.teamRunId,
    verifiedContractIds: Array.isArray(result?.verifiedContractIds) ? result.verifiedContractIds : [],
    evidenceRefs: Array.isArray(result?.evidenceRefs) ? result.evidenceRefs : [],
    usage: result?.usage || null,
    childExecutionObserved: true,
    run: persisted
  };
}

async function executeSubteam(input = {}) {
  validateInput(input);
  const run = await loadAndAdvance(input);
  const claimed = await runtime.claimExecution({ db: input.db, teamRunId: run.teamRunId, ownerId: input.orchestratorId });
  if (!claimed.claimed) {
    return { status: 'WAITING', childRunId: run.teamRunId, reason: 'lease_busy', childExecutionObserved: false };
  }
  const plan = scheduler.stagePlanFor({ orchestratorId: input.orchestratorId, planId: run.teamRunId, members: run.members });
  const skipWorkerIds = Array.isArray(input.skipWorkerIds) ? input.skipWorkerIds : [];
  try {
    const result = await runChildTeam({ input, run, claimed, plan, skipWorkerIds });
    const persisted = await store.load(input.db, run.teamRunId);
    const built = buildResult(run, result);
    built.run = persisted;
    return built;
  } catch (error) {
    await runtime.releaseExecution({ db: input.db, teamRunId: run.teamRunId, token: claimed.token });
    return { status: 'FAILED', childRunId: run.teamRunId, reason: error.code || error.message,
      childExecutionObserved: true };
  } finally {
    await runtime.releaseExecution({ db: input.db, teamRunId: run.teamRunId, token: claimed.token }).catch(() => {});
  }
}

async function defaultLaunch(member, input) {
  const garage = require('../../workerGarageService');
  const agentRuntimeAdapter = require('../../agentRuntimeAdapter');
  const agentId = member.workerId || member.agentId;
  const assignment = { ...member, agentId, prompt: member.mission || member.prompt || '' };
  await garage.reserveSlot(input.db, { orchestratorId: input.orchestratorId, workerId: agentId,
    name: member.name || member.label || member.role, role: member.role || 'worker',
    mission: assignment.prompt });
  try {
    await agentRuntimeAdapter.startMission(assignment);
    return true;
  } catch (error) {
    await garage.releaseSlot(input.db, { orchestratorId: input.orchestratorId, workerId: agentId });
    throw error;
  }
}

function markBlocked(input, workerId, reason) {
  if (typeof input.markBlocked === 'function') return input.markBlocked(workerId, reason);
  try { require('../../agentOrchestrationState').updateAgent(workerId, 'blocked', JSON.stringify(reason)); } catch (_) {}
}

const { createProgramRun, advanceProgramRun } = require('./programRuntimeService');

async function executeMultiteamProgram(input = {}) {
  if (!input.db) throw coded('A database handle is required.', 'ATEAM_MTS_DB_REQUIRED');
  const program = await createProgramRun(input);
  const executeTeam = async (teamInput) => executeSubteam({
    db: input.db, orchestratorId: input.orchestratorId,
    childRunId: teamInput.childRunId, skipWorkerIds: teamInput.skipWorkerIds,
    launchWorker: input.launchWorker, markBlocked: input.markBlocked,
    timeoutMs: input.timeoutMs, pollMs: input.pollMs
  });
  const summary = await advanceProgramRun({
    db: input.db, programId: program.programId, orchestratorId: input.orchestratorId,
    executeTeam, timeoutMs: input.timeoutMs
  });
  return { programId: program.programId, ...summary };
}

function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { executeSubteam, executeMultiteamProgram };