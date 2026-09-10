const { createAutonomousWorkers } = require('../agentFleetService');
const { emit, autonomousRounds } = require('../agentOrchestrationState');
const userProgress = require('../userProgressService');
const { withTransaction } = require('../../db');

function emitTeamComposition(ctx, autonomousWorkers) {
  const { agentId, autonomyPlan } = ctx;
  if (autonomyPlan.aTeam?.activated && autonomousWorkers.length) {
    emit(agentId, 'A_TEAM_COMPOSED', 'COMPOSE_TEAM', `Composed an A-Team with ${autonomousWorkers.length} specialized members.`, {
      domains: autonomyPlan.aTeam.detectedDomains,
      members: autonomousWorkers.map((worker) => ({ workerId: worker.agentId, name: worker.name, role: worker.role }))
    }, 'info');
  }
}

async function launchTrinityWorlds(ctx, autonomousWorkers) {
  const { db, agentId, normalizedMission, autonomyPlan } = ctx;
  if (!(autonomyPlan.trinity?.activated && autonomousWorkers.length)) return;
  const trinityMissionId = `trinity_${agentId}_${Date.now()}`;
  await withTransaction(db, async (tx) => {
    for (const [index, worker] of autonomousWorkers.entries()) {
      const member = autonomyPlan.trinity.members[index];
      await tx.run(
        `INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
           VALUES (?, ?, ?, ?, ?, 'running', ?)`,
        `${trinityMissionId}_world_${index + 1}`,
        normalizedMission.prompt || normalizedMission.currentTask || 'Trinity mission',
        index + 1, worker.name, member.role, worker.agentId
      );
    }
  });
  emit(agentId, 'TRINITY_LAUNCHED', 'COMPOSE_TRINITY', 'Launched three isolated Trinity comparison worlds.', {
    missionId: trinityMissionId,
    worlds: autonomousWorkers.map((worker, index) => ({ workerId: worker.agentId, worldNumber: index + 1, strategy: autonomyPlan.trinity.members[index].role }))
  }, 'info');
}

function emitWorkerCreations(agentId, autonomousWorkers) {
  for (const worker of autonomousWorkers) {
    emit(agentId, 'AUTONOMOUS_WORKER_CREATED', 'FORK', `Created autonomous worker '${worker.name}'.`, { workerId: worker.agentId, role: worker.role, tokenBudget: worker.executionBudget.tokens });
  }
}

function reportWorkerDispatch(ctx, autonomousWorkers) {
  if (autonomousWorkers.length) {
    userProgress.report({
      orchestratorId: ctx.agentId,
      phase: 'working',
      message: `The orchestrator dispatched ${autonomousWorkers.length} worker${autonomousWorkers.length === 1 ? '' : 's'}: ${autonomousWorkers.map((worker) => worker.name).join(', ')}.`,
      next: autonomousWorkers.map((worker) => worker.prompt.split('\n')[1] || worker.role),
      silent: ctx.silentUpdates
    });
  }
}

function registerAutonomousRound(ctx, autonomousWorkers) {
  const { agentId, autonomyPlan } = ctx;
  if (autonomousWorkers.length && autonomyPlan.tokenPolicy.rounds?.continuation?.survivorCount) {
    autonomousRounds.set(agentId, {
      plan: autonomyPlan,
      workerIds: new Set(autonomousWorkers.map((worker) => worker.agentId)),
      workers: new Map(autonomousWorkers.map((worker) => [worker.agentId, worker])),
      results: new Map(),
      advanced: false
    });
  }
}

async function orchestrateAutonomousWorkers(ctx) {
  const { db, dispatchedAgent, autonomyPlan, normalizedMission } = ctx;
  let autonomousWorkers = [];
  if (dispatchedAgent.execution_mode === 'orchestrator' && normalizedMission.autonomousOrchestration !== false) {
    autonomousWorkers = await createAutonomousWorkers(db, dispatchedAgent, autonomyPlan, normalizedMission);
    emitTeamComposition(ctx, autonomousWorkers);
    await launchTrinityWorlds(ctx, autonomousWorkers);
    emitWorkerCreations(ctx.agentId, autonomousWorkers);
    reportWorkerDispatch(ctx, autonomousWorkers);
    registerAutonomousRound(ctx, autonomousWorkers);
  }
  return autonomousWorkers;
}

module.exports = { orchestrateAutonomousWorkers };
