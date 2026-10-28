'use strict';

async function compensate(input) {
  const { ctx, workers, assignments, error } = input;
  const tasks = [
    ['cell dispatch', () => require('../autonomousWorkerCellBridge').fail(ctx, workers, error)],
    ['worker and workspace cleanup', () => cleanupWorkers(ctx, workers, error)],
    ['A-Team run settlement', () => settleTeamRun(ctx)],
    ['Trinity experiment settlement', () => settleTrinityExperiment(ctx)],
    ['Trinity world settlement', () => settleTrinityWorlds(ctx)],
    ['autonomous round cleanup', () => clearAutonomousRound(ctx, workers)]
  ];
  const failures = (await Promise.all(tasks.map(runCompensation))).flat();
  try {
    require('../agentOrchestrationState').emit(ctx.agentId, 'WORKER_POST_CREATION_ACTIVATION_FAILED',
      'WORKER_ACTIVATION', `Worker activation failed: ${error.message}`, {
        errorCode: error.code || 'WORKER_ACTIVATION_FAILED',
        workerIds: workers.map((worker) => worker.agentId),
        requestedWorkers: assignments.length,
        cleanupFailures: failures
      }, failures.length ? 'error' : 'warning');
  } catch (_) {}
}

async function runCompensation(task) {
  try {
    const result = await task[1]();
    return Array.isArray(result) ? result.map((detail) => `${task[0]}: ${detail}`) : [];
  } catch (error) {
    return [`${task[0]}: ${error.message}`];
  }
}

async function cleanupWorkers(ctx, workers, error) {
  const cleanup = require('../agentWorkspaceLifecycleService').scheduleWorkspaceCleanup;
  const results = await Promise.allSettled(workers.map(async (worker) => {
    await ctx.db.run(`UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status NOT IN ('completed', 'failed', 'unverified', 'error', 'terminated', 'apoptosis', 'quarantined')`,
    `Dispatch activation failed: ${error.code || 'worker_activation_failed'}`, worker.agentId);
    await cleanup(worker.agentId);
  }));
  return results.flatMap((result, index) => result.status === 'rejected'
    ? [`${workers[index].agentId}: ${result.reason.message}`] : []);
}

async function settleTeamRun(ctx) {
  const teamRunId = ctx.autonomyPlan.aTeam?.teamRun?.teamRunId;
  if (!teamRunId) return;
  const run = await require('../aTeam/teamRunStore').load(ctx.db, teamRunId);
  if (!run || run.status !== 'RUNNING') return;
  await require('../aTeam/aTeamRuntime').transitionRun({ db: ctx.db,
    teamRunId, revision: run.revision, patch: { status: 'FAILED' } });
}

function trinityExperimentId(ctx) {
  const trinity = ctx.autonomyPlan.trinity || {};
  return trinity.missionId || trinity.experimentId;
}

async function settleTrinityExperiment(ctx) {
  const id = trinityExperimentId(ctx);
  if (!id) return;
  const current = await ctx.db.get('SELECT status FROM trinity_experiments WHERE id = ?', id);
  const status = current?.status === 'designed' ? 'rejected'
    : current?.status === 'sealed_running' ? 'escalated' : null;
  if (!status) return;
  await require('../trinityExperimentStore').transition(ctx.db, { id, status,
    reason: 'worker_dispatch_activation_failed', failureReason: 'Worker dispatch activation failed.' });
}

async function settleTrinityWorlds(ctx) {
  const id = trinityExperimentId(ctx);
  if (!id) return;
  await ctx.db.run(`UPDATE trinity_worlds SET status = 'error', updated_at = CURRENT_TIMESTAMP
    WHERE experiment_id = ? AND status = 'running'`, id);
}

function clearAutonomousRound(ctx, workers) {
  const rounds = require('../agentOrchestrationState').autonomousRounds;
  const round = rounds.get(ctx.agentId);
  if (!round?.workerIds || workers.some((worker) => !round.workerIds.has(worker.agentId))) return;
  rounds.delete(ctx.agentId);
}

module.exports = { compensate };
