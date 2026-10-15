'use strict';

const { autonomousRounds } = require('../agentOrchestrationState');
const epochBudget = require('../morphogenesis/morphogenesisEpochBudget');
const recovery = require('../morphogenesis/morphogenesisEpochRecovery');

async function registerAutonomousRound(ctx, workers) {
  if (ctx.autonomyPlan.trinity?.activated || !hasContinuation(ctx, workers)) return;
  const { agentId, autonomyPlan } = ctx;
  const normalized = ctx.normalizedMission;
  const state = { orchestratorId: agentId, plan: autonomyPlan, db: ctx.db, checkpointScope: scopeOf(normalized, agentId),
    organizationId: normalized.organizationId || null, projectId: normalized.projectId || null,
    normalizedMission: normalized, workerIds: new Set(workers.map(worker => worker.agentId)),
    workers: new Map(workers.map(worker => [worker.agentId, worker])), results: new Map(), epoch: 0,
    epochBudget: epochBudget.createEpochBudget(continuationPool(autonomyPlan),
      normalized.morphogenesisPolicy || {}, autonomyPlan.tokenPolicy.minimumWorkerTokens || 1), advanced: false };
  autonomousRounds.set(agentId, state);
  await recovery.registerInitialRound(state);
}

function hasContinuation(ctx, workers) {
  const count = ctx.autonomyPlan.tokenPolicy.rounds?.continuation?.survivorCount;
  return workers.length > 0 && Number.isInteger(count) && count > 0;
}

function continuationPool(plan) {
  return plan.tokenPolicy.rounds?.continuation?.pool || 0;
}

function scopeOf(mission, fallback) {
  return { missionId: mission.missionId || fallback,
    organizationId: mission.organizationId || null, projectId: mission.projectId || null };
}

module.exports = { registerAutonomousRound };
