'use strict';

const MAX_WORKER_DEADLINE_MS = 24 * 60 * 60 * 1000;
const DEADLINE_CHECK_INTERVAL_MS = 1000;

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
  const requestedDuration = Number(context.normalizedMission.timeoutMs);
  if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) return;
  const duration = Math.min(requestedDuration, MAX_WORKER_DEADLINE_MS);
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - startedAt < duration) return;
    clearInterval(timer);
    context.haltRuntime(context, 'worker_deadline', 'worker_execution_deadline_exceeded',
      'Worker runtime stopped after reaching its contract deadline.', { maxTimeMs: duration });
  }, DEADLINE_CHECK_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  context.child.once('close', () => clearInterval(timer));
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

function runtimeStopped(child) {
  if (child.killed || child.exitCode !== null || child.signalCode !== null) return true;
  try {
    process.kill(child.pid, 0);
    return false;
  } catch (failure) {
    return failure.code === 'ESRCH';
  }
}

function rejectCpuAccounting(context, state, failure) {
  if (runtimeStopped(context.child)) return;
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  cpuFailure(context, 'worker_cpu_accounting_unavailable', {
    maxCpuMs: state.limit,
    reason: failure && failure.message ? failure.message : String(failure)
  });
}

function reportCpuAccountingFailure(context, state, failure) {
  rejectCpuAccounting(context, state, failure);
}

async function sampleCpuBudget(context, state) {
  if (state.sampling || context.child.killed || context.child.exitCode !== null || context.child.signalCode !== null) return;
  state.sampling = true;
  try {
    const current = await require('./workerProcessCpu').processCpuMs(context.child.pid, process.platform, state);
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
    cpuFailure(context, 'worker_cpu_budget_invalid', {
      maxCpuMs: resources.maxCpuMs, reason: 'Worker CPU limit is not finite.'
    });
    return;
  }
  if (limit === 0) {
    cpuFailure(context, 'worker_cpu_budget_exceeded', { maxCpuMs: limit, observedCpuMs: 0 });
    return;
  }
  if (limit < 0 || !context.child.pid) {
    cpuFailure(context, limit < 0 ? 'worker_cpu_budget_invalid'
      : 'worker_cpu_accounting_unavailable', {
      maxCpuMs: limit, reason: 'Worker CPU budget requires a measurable process and a nonnegative limit.'
    });
    return;
  }
  const state = { limit, previous: 0, consumed: 0, sampling: false, timer: null };
  const intervalMs = Math.min(500, Math.max(50, Math.floor(limit / 100)));
  const timer = setInterval(() => sampleCpuBudget(context, state), intervalMs);
  state.timer = timer;
  if (typeof timer.unref === 'function') timer.unref();
  context.child.once('close', () => clearInterval(timer));
}

module.exports = { clampMissionBudget, startWorkerDeadline, startWorkerCpuBudget, runtimeStopped };
