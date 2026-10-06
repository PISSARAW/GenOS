'use strict';

const runtime = require('./aTeamRuntime');
const store = require('./teamRunStore');
const scheduler = require('../aTeamStageScheduler');
const { executeTeamRun } = require('./execution/teamExecutionService');
const { executionMission } = require('./execution/teamEvidenceService');
const garage = require('../workerGarageService');

async function executeAutonomousTeam(input) {
  let run = await store.load(input.db, input.autonomyPlan.aTeam.teamRun.teamRunId);
  if (!run) throw coded('Canonical autonomous A-Team run is missing.', 'ATEAM_RUN_UNKNOWN');
  run = await require('../aTeamDispatchService').advanceRunToExecution(input.db, run);
  const claimed = await runtime.claimExecution({ db: input.db, teamRunId: run.teamRunId, ownerId: input.agentId });
  if (!claimed.claimed) throw coded('Another runner owns this A-Team run.', 'ATEAM_RUN_LEASE_BUSY');
  const plan = scheduler.stagePlanFor({ orchestratorId: input.agentId, planId: run.teamRunId, members: run.members });
  const byWorker = new Map(input.workers.map((worker) => [worker.agentId, worker]));
  try {
    const result = await executeTeamRun({ db: input.db, teamRunId: run.teamRunId, runnerToken: claimed.token, plan,
      launch: (member) => launchMember(member, { ...input, run, byWorker }),
      onBlocked: (member, reason) => markBlocked(input, member.workerId, reason),
      options: { ...input.options, timeoutMs: input.timeoutMs,
        onTick: () => assertNotCancelled(input) } });
    input.autonomyPlan.aTeam.teamRun = await store.load(input.db, run.teamRunId);
    if (!result.accepted) throw coded('A-Team execution did not satisfy integration contracts.', 'ATEAM_INTEGRATION_REJECTED');
    return result;
  } catch (error) {
    await stopUnfinishedWorkers(input);
    throw error;
  } finally {
    await runtime.releaseExecution({ db: input.db, teamRunId: run.teamRunId, token: claimed.token });
  }
}

async function stopUnfinishedWorkers(input) {
  const rows = await Promise.all(input.workers.map(async (worker) => ({ worker,
    row: await input.db.get('SELECT status FROM agents WHERE id = ?', worker.agentId) })));
  const active = rows.filter(({ row }) => row?.status === 'running').map(({ worker }) => worker);
  const stop = input.stopWorkers || require('../workerEvidenceBarrierHelpers').stopWorkersQuietly;
  await stop(active);
}

async function launchMember(member, context) {
  assertNotCancelled(context);
  const worker = context.byWorker.get(member.workerId);
  if (!worker) throw coded('Canonical A-Team worker is missing.', 'ATEAM_WORKER_MISSING');
  const prompt = executionMission({ ...member, mission: worker.prompt }, context.run.successCriteria);
  const assignment = { ...member, ...worker, handoffContext: member.handoffContext, agentId: worker.agentId, prompt: require('../aTeamHandoffEvidenceService').missionWithHandoffs(prompt, member.handoffContext),
    strategyContract: context.contract, autonomousOrchestration: false };
  await (context.reserveSlot || reserveSlot)(context, assignment);
  try {
    const launch = context.startMission || require('../agentRuntimeAdapter').startMission;
    await launch(assignment);
    return true;
  } catch (error) {
    await garage.releaseSlot(context.db, { orchestratorId: context.agentId, workerId: member.workerId });
    throw error;
  }
}

function reserveSlot(context, worker) {
  return garage.reserveSlot(context.db, { orchestratorId: context.agentId, workerId: worker.agentId,
    name: worker.name, role: worker.role, mission: worker.prompt });
}

function markBlocked(input, workerId, reason) {
  if (input.markBlocked) return input.markBlocked(workerId, reason);
  return require('../agentOrchestrationState').updateAgent(workerId, 'blocked', JSON.stringify(reason));
}

function assertNotCancelled(input) {
  if (input.barrier?.cancelled) throw coded('Worker evidence barrier cancelled.', 'WORKER_BARRIER_CANCELLED');
}

function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { executeAutonomousTeam };
