'use strict';

/**
 * @file multiteamExecutionAdapter.js
 * @description Adaptateur reutilisable pour l'execution d'une sous-equipe multiteam.
 * Il prepare/reprend un TeamRun enfant, revendique le bail CAS, execute le run via
 * l'executeur commun et renvoie un resultat compatible avec programRuntimeService
 * (status, childRunId, verifiedContractIds, evidenceRefs, usage).
 * L'approvisionnement des workers et la fonction de lancement restent fournis par
 * l'appelant (contexte d'orchestration), car ils dependent de l'agent runtime.
 */
const runtime = require('../aTeamRuntime');
const store = require('../teamRunStore');
const scheduler = require('../../aTeamStageScheduler');
const { executeTeamRun } = require('../execution/teamExecutionService');
const dispatchService = require('../../aTeamDispatchService');

async function executeSubteam(input = {}) {
  if (!input.db) throw coded('A database handle is required.', 'ATEAM_MTS_DB_REQUIRED');
  if (!input.childRunId) throw coded('A child TeamRun is required.', 'ATEAM_MTS_CHILD_RUN_REQUIRED');
  let run = await store.load(input.db, input.childRunId);
  if (!run) throw coded('Unknown child TeamRun.', 'ATEAM_MTS_CHILD_RUN_UNKNOWN');
  run = await dispatchService.advanceRunToExecution(input.db, run);
  const claimed = await runtime.claimExecution({ db: input.db, teamRunId: run.teamRunId, ownerId: input.orchestratorId });
  if (!claimed.claimed) {
    return { status: 'WAITING', childRunId: run.teamRunId, reason: 'lease_busy', childExecutionObserved: false };
  }
  const plan = scheduler.stagePlanFor({ orchestratorId: input.orchestratorId, planId: run.teamRunId, members: run.members });
  const skipWorkerIds = Array.isArray(input.skipWorkerIds) ? input.skipWorkerIds : [];
  try {
    const result = await executeTeamRun({
      db: input.db, teamRunId: run.teamRunId, runnerToken: claimed.token, plan,
      executeTeam: input.executeTeam,
      launch: (member) => (typeof input.launchWorker === 'function'
        ? input.launchWorker(member, input)
        : Promise.resolve(true)),
      onBlocked: (member, reason) => markBlocked(input, member.workerId, reason),
      options: { skipWorkerIds, pollMs: input.pollMs || 500,
        timeoutMs: input.timeoutMs || 15 * 60 * 1000 }
    });
    const persisted = await store.load(input.db, run.teamRunId);
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
  } catch (error) {
    await runtime.releaseExecution({ db: input.db, teamRunId: run.teamRunId, token: claimed.token });
    return { status: 'FAILED', childRunId: run.teamRunId, reason: error.code || error.message,
      childExecutionObserved: true };
  } finally {
    await runtime.releaseExecution({ db: input.db, teamRunId: run.teamRunId, token: claimed.token }).catch(() => {});
  }
}

function markBlocked(input, workerId, reason) {
  if (typeof input.markBlocked === 'function') return input.markBlocked(workerId, reason);
  try { require('../../agentOrchestrationState').updateAgent(workerId, 'blocked', JSON.stringify(reason)); } catch (_) {}
}

function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { executeSubteam };