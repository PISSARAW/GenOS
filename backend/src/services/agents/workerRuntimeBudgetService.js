'use strict';

function clampMissionBudget(mission, budget) {
  if (!mission.workerContract?.resources) return budget;
  const resources = mission.workerContract.resources;
  if (resources.executionMode !== 'model' || resources.maxTokens === 0) {
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

function cpuFailure(context, reason, details) {
  context.haltRuntime(context, 'worker_cpu_budget', reason,
    'Worker runtime stopped because its CPU budget could not be enforced.', details);
}

function recordCpuSample(context, state, current) {
  if (!Number.isFinite(current) || current < 0) throw new Error('CPU meter returned an invalid value.');
  state.consumed += Math.max(0, current - state.previous);
  state.previous = current;
  if (state.consumed < state.limit) return;
  cpuFailure(context, 'worker_cpu_budget_exceeded', { maxCpuMs: state.limit,
    observedCpuMs: Math.floor(state.consumed) });
}

function reportCpuAccountingFailure(context, state, failure) {
  if (context.child.killed || context.child.exitCode !== null || context.child.signalCode !== null) return;
  cpuFailure(context, 'worker_cpu_accounting_unavailable', { maxCpuMs: state.limit,
    reason: failure.message });
}

async function sampleCpuBudget(context, state) {
  if (state.sampling || context.child.killed || context.child.exitCode !== null || context.child.signalCode !== null) return;
  state.sampling = true;
  try {
    const current = await require('./workerProcessCpu').processCpuMs(context.child.pid);
    recordCpuSample(context, state, current);
  } catch (failure) {
    reportCpuAccountingFailure(context, state, failure);
  } finally {
    state.sampling = false;
  }
}

function startWorkerCpuBudget(context) {
  const resources = context.normalizedMission.workerContract?.resources;
  if (!resources || !Object.hasOwn(resources, 'maxCpuMs')) return;
  const limit = Number(resources.maxCpuMs);
  if (!Number.isFinite(limit)) {
    cpuFailure(context, 'worker_cpu_accounting_unavailable', { maxCpuMs: resources.maxCpuMs,
      observedCpuMs: 0 });
    return;
  }
  if (limit <= 0 || !context.child.pid) {
    cpuFailure(context, limit === 0 ? 'worker_cpu_budget_exceeded' : 'worker_cpu_accounting_unavailable',
      { maxCpuMs: limit, observedCpuMs: 0 });
    return;
  }
  const state = { limit, previous: 0, consumed: 0, sampling: false };
  const intervalMs = Math.min(500, Math.max(50, Math.floor(limit / 100)));
  const timer = setInterval(() => sampleCpuBudget(context, state), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  context.child.once('close', () => clearInterval(timer));
}

module.exports = { clampMissionBudget, startWorkerDeadline, startWorkerCpuBudget };
