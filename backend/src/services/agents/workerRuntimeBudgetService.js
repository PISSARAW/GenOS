'use strict';

function clampMissionBudget(mission, budget) {
  if (!mission.workerContract?.resources) return budget;
  const resources = mission.workerContract.resources;
  if (resources.maxTokens === 0) {
    throw Object.assign(new Error(`Worker '${mission.workerKind}' has no registered deterministic executor.`), {
      code: 'WORKER_EXECUTOR_UNAVAILABLE'
    });
  }
  if (Number.isFinite(resources.maxTokens)) budget.tokens = Math.min(budget.tokens, resources.maxTokens);
  if (Number.isFinite(resources.maxTimeMs)) {
    budget.latencyMs = Math.min(budget.latencyMs, resources.maxTimeMs);
    mission.timeoutMs = Math.min(Number(mission.timeoutMs) || resources.maxTimeMs, resources.maxTimeMs);
  }
  return budget;
}

function startWorkerDeadline(context) {
  const duration = Number(context.normalizedMission.timeoutMs);
  if (!Number.isFinite(duration) || duration <= 0) return;
  const timer = setTimeout(() => context.haltRuntime(
    context,
    'worker_deadline',
    'worker_execution_deadline_exceeded',
    'Worker runtime stopped after reaching its contract deadline.',
    { maxTimeMs: duration }
  ), duration);
  if (typeof timer.unref === 'function') timer.unref();
  context.child.once('close', () => clearTimeout(timer));
}

module.exports = { clampMissionBudget, startWorkerDeadline };
